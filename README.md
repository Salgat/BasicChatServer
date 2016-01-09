# Single Endpoint Chat Server
A basic chat server with a single endpoint.

## Example

A live example is at http://singleendpointchatserver.herokuapp.com.

To test, use your favorite REST client (I use the Chrome App "Advanced Rest Client") and do the following POST request,
* POST http://singleendpointchatserver.herokuapp.com/api/v1/chatroom/testRoom?username=testName&message=your%20message&expireafter=300

You should see the response,

  ```json
  {
    "room":
      {
        "name":"Test Room",
        "members":"Jeff:1452364323719,John:1452364325124",
        "messages":["Jeff: hello", "John: Hey!"]
      }
  }
  ```
  
It's important to remember to URL Encode the parameters prior to sending, otherwise certain symbols such as '&' will be interpreted as a parameter instead of being part of the message. A website such as [URL Decoder/Encoder](http://meyerweb.com/eric/tools/dencoder/) can be used for manually encoding parameters.

All parameters are optional, which is useful when you just want to view the messages in a chat room. By setting 'expireafter' to 0, no username will be added to the chat room member list, allowing completely anonymous chatroom viewing.
  
## Installation And Running
 
### Requirements
 Install both of these prior to running this project.
* [npm (package manager)](https://www.npmjs.com)
* [redis (database)](http://redis.io/)

### Running
* Open the command line, change the directory to where this project is located, and enter command "npm install" then "npm start".

### Description
Single Endpoint Chat Server was created to provide an easy way for users to setup a chatroom with minimal requirements for the client. The consumer of this service simply has to use one POST endpoint. While this service does not provide user authentication, the following features are supported,

1) Custom chat rooms created on-demand.
2) Everything is customizable, from the username, to how long the username appears in a chatroom's member list, to being able to completely anonymously view chatrooms.
3) High performance using redis.
