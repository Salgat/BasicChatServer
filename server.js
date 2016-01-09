var express = require('express');
var app = express();
var request = require('request');
var promise = require("bluebird");
var async = require('asyncawait/async');
var await = require('asyncawait/await');
var moment = require('moment');
var cors = require('cors');
app.use(cors());

var redisLib = require('redis');
promise.promisifyAll(redisLib.RedisClient.prototype);
promise.promisifyAll(redisLib.Multi.prototype);
var redis;
if (process.env.REDIS_URL) {
  redis = redisLib.createClient(process.env.REDIS_URL);
} else {
  redis = redisLib.createClient();
}

app.set('port', (process.env.PORT || 5000));

app.listen(app.get('port'), function() {
  console.log('BasicChatServer is running on port', app.get('port'));
});

redis.on('connect', function() {
    console.log('connected to redis');
});

// TODO: Add Server Config in a json file instead of here
var maxMessagesPerRoom = 1000;
var defaultMemberExpiration = 5*60; // By default, remove member from chatroom after 5 minutes

/**
 * POST Username to Chatroom.
 */
app.post('/api/v1/chatroom/:roomName', function(request, response) {
  var roomName = request.params.roomName;
  var userName = request.query["username"];
  var message = request.query["message"];
  var expireAfter = request.query["expireafter"];
  
  if (!expireAfter) {
      expireAfter = defaultMemberExpiration;
  }
  
  if (!userName || userName == "") {
      userName = "Guest";
  }
  
  console.log("Room Name: " + roomName);
  console.log("User Name: " + userName);
  console.log("Message: " + message);
  console.log("Expires After: " + expireAfter);
  
  var result = async (function() {
    var chatRoomState = await (updateChatRoom(roomName, userName, message, expireAfter));
  
    // Respond with the chatroom's information
    var chatRoomJson = {
        "room": {
            "name": roomName,
            "members": chatRoomState.room.members,
            "messages": chatRoomState.room.messages
        }
    };
    response.status(200);
    response.send(chatRoomJson);
  });
  result();
});

/**
 * Add message (if provided) to chatroom, then update and return the state of the chat room.
 */
function updateChatRoom(roomName, userName, message, expireAfter) {
    if (userName != "Guest" && message) {
        // Add the message if it is provided and keep only the last 1000 messages
        console.log("Adding message");
        var messagesKey = roomName+':messages';
        redis.lpush(messagesKey, userName+': '+message);
        redis.ltrim(messagesKey, 0, 999);
        console.log('Message added');
    }
    
    // Get chat room messages
    var messages = await (retrieveChatRoomMessages(roomName));
    
    // Add user to chat room member list
    await (addUserToChatRoom(roomName, userName, expireAfter));
    
    // Check for expiration of any userNames in the current roomName
    var members = await (removeExpiredMembers(roomName));
    
    return {
      "room": {
          "name": roomName,
          "members": members,
          "messages": messages
      }
  };
}

/**
 * Returns the messages for the provided chat room.
 */
function retrieveChatRoomMessages(roomName) {
    return await(redis.lrangeAsync(roomName+':messages', 0, 999).then(function(response) {
        return response;
    }));
}

/**
 * Remove all expired members from the current chat room.
 */
function removeExpiredMembers(roomName) {
    console.log("Removing expired members");
    var members = null;
    return await (redis.getAsync(roomName+':members').then(function(response) {
        console.log(response);
        if (response) {
            members = response.split(',');
            var membersDictionary = {};
            members.forEach(function(entry){
                // Populate a dictionary of all members and their last timestamp
                var member = entry.split(':')[0];
                var timestamp = entry.split(':')[1];
                console.log("Setting member to timestamp: " + member + ', ' + timestamp);
                membersDictionary[member] = timestamp;
            });
            
            // Create a new members list with the last timestamp provided.
            members = "";
            var timeNow = moment().valueOf();
            for (var member in membersDictionary) {
                if (membersDictionary.hasOwnProperty(member)) {
                    if (members != "") {
                        members += ",";
                    }
                    // Only add member if they aren't expired
                    if (timeNow < membersDictionary[member]) {
                        members += member + ':' + membersDictionary[member];
                    }
                }
            }
            
            console.log("Settting room to member list to: " + roomName+':members' + ', ' + members);
            redis.set(roomName+':members', members);
               console.log("Finished removing expiring members");
            return members;
        }
    }));
}

/**
 * Adds user name to member list in chat room.
 */
function addUserToChatRoom(roomName, userName, expireAfter) {
    console.log("Adding user to chatroom");
    var timestamp = moment().valueOf() + expireAfter*1000;
    return await (redis.getAsync(roomName+':members').then(function(response) {
        console.log(response);
        var memberList = '';
        if (!response) {
            memberList += userName+':'+timestamp;
        } else {
            memberList = response + ',' + userName+':'+timestamp;
        }
        redis.set(roomName+':members', memberList);
    }));
}