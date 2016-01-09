var express = require('express');
var app = express();
var request = require('request');
var cors = require('cors');
app.use(cors());

var redisClient;
if (process.env.REDIS_URL) {
  redisClient = require('redis').createClient(process.env.REDIS_URL);
} else {
  redisClient = require('redis').createClient();
}

app.set('port', (process.env.PORT || 5000));

app.listen(app.get('port'), function() {
  console.log('BasicChatServer is running on port', app.get('port'));
});

redisClient.on('connect', function() {
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
  
  var chatRoomState = updateChatRoom(roomName, userName, message);
  
  // Respond with the chatroom's information
  var chatRoomJson = {
      "room": {
          "name": roomName,
          "members": chatRoomState.members,
          "messages": chatRoomState.messages
      }
  };
  response.status(200);
  response.send(chatRoomJson);
  
});

/**
 * Remove all expired members from the current chat room and return the updated chat room state.
 */
function updateChatRoom(roomName, userName, message) {
    if (userName != "Guest" && message) {
        // Add the message if it is provided
    }
    
    // Check for expiration of any userNames in the current roomName
    
    
    
    return {
      "room": {
          "name": "todo",
          "members": [],
          "messages": []
      }
  };
}