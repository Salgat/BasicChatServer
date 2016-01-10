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

var limiter = require('express-limiter')(app, redis);
limiter({
  path: '/api/v1/chatroom/:roomName',
  method: 'post',
  lookup: ['connection.remoteAddress'],
  // 20 requests per second per IP
  total: 20*60*60,
  expire: 1000 * 60 * 60
})

app.set('port', (process.env.PORT || 5000));

app.listen(app.get('port'), function() {
  console.log('Single Endpoint Chat Server is running on port', app.get('port'));
});

redis.on('connect', function() {
    console.log('connected to redis');
});

// TODO: Add Server Config in a json file instead of here
var maxMessagesPerRoom = 1000;
var defaultMemberExpiration = 5*60; // By default, remove member from chatroom after 5 minutes

/**
 * POST Username to Chatroom and return result in response.
 */
app.post('/api/v1/chatroom/:roomName', function(request, response) {
  var roomName = request.params.roomName;
  var userName = request.query["username"];
  var message = request.query["message"];
  var expireAfter = request.query["expireafter"];
  
  var validate = validateParameters(roomName, userName, message, expireAfter);
  if (validate) {
      response.status(400);
      response.send(validate);
      return;
  }
  
  if (!expireAfter) {
      expireAfter = defaultMemberExpiration;
  }
  
  if (!userName || userName == "") {
      userName = "Guest";
  }
  
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
 * Validates request parameters prior to using them.
 */
function validateParameters(roomName, userName, message, expireAfter) {
    // Only letters, numbers, and underscore
    var lettersNumbersAndUnderscoreTest = new RegExp(/^\w*$/);
    if (!lettersNumbersAndUnderscoreTest.test(roomName)) {
        return "Room name contains unsupported string literals: " + roomName;
    }
    if (!lettersNumbersAndUnderscoreTest.test(userName)) {
        return "User name contains unsupported string literals: " + userName;
    }
    
    // Messages can have any content since they do not interfere with any processing logic
    
    // Only integer number (since time is in ms since epoch)
    var integerTest = new RegExp(/^\d+$/);
    if (!integerTest.test(expireAfter)) {
        return "Expire after must be an integer number: " + expireAfter;
    }
}

/**
 * Add message (if provided) to chatroom, then update and return the state of the chat room.
 */
function updateChatRoom(roomName, userName, message, expireAfter) {
    if (userName != "Guest" && message) {
        // Add the message if it is provided and keep only the last 1000 messages
        var messagesKey = roomName+':messages';
        redis.lpush(messagesKey, userName+': '+message);
        redis.ltrim(messagesKey, 0, 999);
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
    var members = null;
    return await (redis.getAsync(roomName+':members').then(function(response) {
        if (response) {
            members = response.split(',');
            var membersDictionary = {};
            members.forEach(function(entry){
                // Populate a dictionary of all members and their last timestamp
                var member = entry.split(':')[0];
                var timestamp = entry.split(':')[1];
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
            
            redis.set(roomName+':members', members);
            return members;
        }
    }));
}

/**
 * Adds user name to member list in chat room.
 */
function addUserToChatRoom(roomName, userName, expireAfter) {
    var timestamp = moment().valueOf() + expireAfter*1000;
    return await (redis.getAsync(roomName+':members').then(function(response) {
        var memberList = '';
        if (!response) {
            memberList += userName+':'+timestamp;
        } else {
            memberList = response + ',' + userName+':'+timestamp;
        }
        redis.set(roomName+':members', memberList);
    }));
}