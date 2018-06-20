"use strict";
const debug = require('debug')('http');
const apiai = require("apiai");
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const uuid = require("uuid");
const logger = require("morgan");
const { greetUserText, isDefined, sendAccountLinking, sendButtonMessage, sendGenericMessage, sendImageMessage, sendQuickReply, sendReadReceipt, sendReceiptMessage, sendTextMessage, sendTypingOff, sendTypingOn } = require("./services/payload");
const { callSendAPI } = require("./services/api");
const cli = require('./config/cli').console;
const constant = require('./config/constant');
const db = require("./config/db");
const Food = require('./models/food');
const User = require('./models/user')
const FoodTypes = require('./models/food-Type')
const async = require('async')

// Food.find({},function(error,result){
//     console.log(result)
// })
// Messenger API parameters
if (!constant.FB_PAGE_TOKEN) {
    throw new Error("missing FB_PAGE_TOKEN");
}
if (!constant.FB_VERIFY_TOKEN) {
    throw new Error("missing FB_VERIFY_TOKEN");
}
if (!constant.API_AI_CLIENT_ACCESS_TOKEN) {
    throw new Error("missing API_AI_CLIENT_ACCESS_TOKEN");
}
if (!constant.FB_APP_SECRET) {
    throw new Error("missing FB_APP_SECRET");
}
if (!constant.SERVER_URL) {
    //used for ink to static files
    throw new Error("missing SERVER_URL");
}
app.use(logger("dev"));
app.set("port", process.env.PORT || 5000);
// set the view engine to ejs
app.set('view engine', 'ejs');
//serve static files in the public directory
app.use('/public', express.static(__dirname + '/public'));
// Process application/x-www-form-urlencoded
app.use(
    bodyParser.urlencoded({
        extended: true
    })
);
// Process application/json
app.use(bodyParser.json());
const apiAiService = apiai(constant.API_AI_CLIENT_ACCESS_TOKEN, {
    language: "en",
    requestSource: "fb"
});
const sessionIds = new Map();
app.use((req, res, next) => {
    res.header('Access-Control-Expose-Headers', 'Authorization');
    next();
});
app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,x-auth,Authorization');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);
    // Pass to next layer of middleware
    next();
});

// Index route
app.get("/", function (req, res) {
    res.render('index');
});

// for Facebook verification
app.get("/webhook/", function (req, res) {
    console.log("request");
    if (
        req.query["hub.mode"] === "subscribe" &&
        req.query["hub.verify_token"] === constant.FB_VERIFY_TOKEN
    ) {
        res.status(200).send(req.query["hub.challenge"]);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
});

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post("/webhook/", function (req, res) {
    var data = req.body;
    // Make sure this is a page subscription
    if (data.object == "page") {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function (pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;
            // if (pageEntry.standby) {
            //     // iterate webhook events from standby channel
            //     pageEntry.standby.forEach(event => {
            //         const psid = event.sender.id;
            //         const message = event.message;
            //         if (message && message.quick_reply && message.quick_reply.payload == 'take_from_inbox') {
            //             var responseText = "Bot is back in control";
            //             sendTextMessage(psid, responseText)
            //             // sendQuickReply(psid, text, title, payload);
            //             HandoverProtocol.takeThreadControl(psid);
            //         }
            //     });
            // } else 
            if (pageEntry.messaging) {
                // Iterate over each messaging event
                pageEntry.messaging.forEach(function (messagingEvent) {

                    if (messagingEvent.message) {
                        receivedMessage(messagingEvent);
                    } else if (messagingEvent.delivery) {
                        receivedDeliveryConfirmation(messagingEvent);
                    } else if (messagingEvent.postback) {
                        receivedPostback(messagingEvent);
                    } else if (messagingEvent.read) {
                        receivedMessageRead(messagingEvent);
                    } else if (messagingEvent.account_linking) {
                        receivedAccountLink(messagingEvent);
                    } else {
                        console.log(
                            "Webhook received unknown messagingEvent: ",
                            messagingEvent
                        );
                    }
                });
            }
        });

        // Assume all went well.
        // You must send back a 200, within 20 seconds
        res.sendStatus(200);
    }
});
function receivedMessage(event) {

    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    if (!sessionIds.has(senderID)) {
        sessionIds.set(senderID, uuid.v1());
    }

    var isEcho = message.is_echo;
    var messageId = message.mid;
    var appId = message.app_id;
    var metadata = message.metadata;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;

    var quickReply = message.quick_reply;
    const psid = event.sender.id;

    if (message && quickReply && quickReply.payload == 'pass_to_inbox') {

        // quick reply to pass to Page inbox was clicked
        let page_inbox_app_id = 263902037430900;
        var text = 'Bot is transfering Control to Our Admin';
        var title = 'Cancle This.';
        var payload = 'take_from_inbox';

        _sendQuickReply(psid, text, title, payload);
        HandoverProtocol.passThreadControl(psid, page_inbox_app_id);

    } else if (event.pass_thread_control) {
        // thread control was passed back to bot manually in Page inbox
        var responseText = 'Query Solved.';
        _sendQuickReply(psid, responseText);
    }

    else if (isEcho) {
        handleEcho(messageId, appId, metadata);
        return;
    } else if (quickReply) {
        handleQuickReply(senderID, quickReply, messageId);
        return;
    }

    if (messageText) {
        //send message to api.ai
        sendToApiAi(senderID, messageText);
    } else if (messageAttachments) {
        console.log(messageAttachments[0].payload.url);
        if (messageAttachments[0].payload.sticker_id) {
            handleMessageAttachments(messageAttachments, senderID)
        } else if (messageAttachments[0].payload.url.indexOf('.pdf') == -1) {
            sendTextMessage(senderID, "I told You to send me PDF, Now You may have to refill all this.\n send me Again in PDF format. I am Very Strict about it.")
        } else {
            sendToApiAi(senderID, messageAttachments[0].payload.url);
        }
        // handleMessageAttachments(messageAttachments, senderID);
    }
}

/**
 * Handle Attachment (sticker, image, PDF)
 * @param {*} messageAttachments 
 * @param {*} senderID 
 */
function handleMessageAttachments(messageAttachments, senderID) {
    if (messageAttachments[0].payload.sticker_id) {
        sendTextMessage(senderID, "👍🏻");
    } else if (messageAttachments[0].payload.url.indexOf('.pdf') != -1 || messageAttachments[0].payload.url.indexOf('https://') != -1) {
        console.log("got pdf")
    } else if (messageAttachments[0].payload.url.indexOf('.gif') != -1) {
        console.log("got Gif")
    } else if (messageAttachments[0].payload.url.indexOf('.jpg') != -1) {
        console.log("got image")
    }
    else {
        sendTextMessage(senderID, "Attachment received. Thank you.");
    }
}

/**
 * Handle Quick Reply Payload messages
 * @param {*} senderID 
 * @param {*} quickReply 
 * @param {*} messageId 
 */
function handleQuickReply(senderID, quickReply, messageId) {
    var quickReplyPayload = quickReply.payload;
    console.log(
        "Quick reply for message %s with payload %s",
        messageId,
        quickReplyPayload
    );
    //send payload to api.ai
    sendToApiAi(senderID, quickReplyPayload);
}
//https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-echo
function handleEcho(messageId, appId, metadata) {
    // Just logging message echoes to console
    console.log(
        "Received echo for message %s and app %d with metadata %s",
        messageId,
        appId,
        metadata
    );
}
/**
 * Handle Action  and based on It send Payload 
 */
 function handleApiAiAction(sender, action, responseText, contexts, parameters) {
    function foodContent(paramenters, sender) {
        var type = paramenters.foodType;
        console.log("Type::", paramenters.foodType);
        var elements = [];
        async.eachSeries(type, (foodType) => {
            FoodTypes.find({ sType: foodType }, (error, result) => {
                result.forEach(el => {
                    elements.push({
                        "title": el.sTitle,
                        "subtitle": el.sSubTitle,
                        "imageUrl": el.sImage,
                        "buttons": [{
                            "text": "View More",
                            "postback": el.sPostback
                        }]
                    })
                })
                var responseText = "Here is your Food Click below to know more"
                sendTextMessage(sender, responseText)
                handleCardMessages(elements, sender);
            })
        })
        // handleCardMessages(elements, sender)
    }
    function foodType(action, parameters, sender) {
        var type = parameters["foodType"];
        console.log(type);
        if (type.length > 1) {
            cli.magenta("IN IFFF");
            var elements = [];
            var promise = function () {
                return new Promise(function (resolve, reject) {
                     async.eachSeries(type, async (foodType) => {
                        var elements = [];
                         await Food.find({ sType: foodType }, (error, result) => {
                            result.forEach(el => {
                                elements.push({
                                    "title": el.sTitle,
                                    "subtitle": el.sSubTitle,
                                    "imageUrl": el.sImage,
                                    "buttons": [{
                                        "text": "Add to Cart",
                                        "postback": el.sPostback
                                    }]
                                })
                            })
                            
                        })
                        resolve();
                    }) 
                })
            };
            promise().then(()=>{
                handleCardMessages(elements, sender)
            })
        } else if (action === "PIZZAMORE" || type === "pizza") {
            cli.magenta("IN ELSE IFFF 1")

            var elements = [];
            Food.find({ sType: "pizza" }, (error, result) => {
                result.forEach(el => {
                    elements.push({
                        "title": el.sTitle,
                        "subtitle": el.sSubTitle,
                        "imageUrl": el.sImage,
                        "buttons": [{
                            "text": "Add to Cart",
                            "postback": el.sPostback
                        }]
                    })
                })
                handleCardMessages(elements, sender)
            })
        } else if (action === "BURGERMORE" || type === "burger") {
            cli.magenta("IN ELSE IFFF 2")
            var elements = [];
            Food.find({ sType: "burger" }, (error, result) => {
                result.forEach(el => {
                    elements.push({
                        "title": el.sTitle,
                        "subtitle": el.sSubTitle,
                        "imageUrl": el.sImage,
                        "buttons": [{
                            "text": "Add to Cart",
                            "postback": el.sPostback
                        }]
                    })
                })
                console.log(elements);
                handleCardMessages(elements, sender)
            })
            handleCardMessages(elements, sender)
        } else if (action === "SENDWHICHMORE" || type === "sandwich") {
            cli.magenta("IN ELSE IFFF 3")

            var elements = [];
            Food.find({ sType: "sandwich" }, (error, result) => {
                result.forEach(el => {
                    elements.push({
                        "title": el.sTitle,
                        "subtitle": el.sSubTitle,
                        "imageUrl": el.sImage,
                        "buttons": [{
                            "text": "Add to Cart",
                            "postback": el.sPostback
                        }]
                    })
                })
                console.log(elements);
                handleCardMessages(elements, sender)
            })
            handleCardMessages(elements, sender)
        } else {
            sendTextMessage(sender, "Sorryy we don't Provide that.")
        }
    }
    cli.magenta(action)
    switch (action) {
        case "FACEBOOK_WELCOME":
            greetUserText(sender);
            break;
        case "food-browse":
        case "food-search":
            console.log(parameters.foodType);
            console.log(parameters.pizza);
            console.log(parameters.sandwich);
            console.log(parameters.burger);
            if (parameters.foodType.length > 0) {
                foodContent(parameters, sender)
            }
            break;

        case "food-more-type":
        case "PIZZAMORE":
        case "BURGERMORE":
        case "SENDWHICHMORE":
            foodType(action, parameters, sender)
            break;
        case "food-add-cart":
            cli.red("yahoooooooooooooooo");
            let nPrice = 0;
            /**
             * Convert the object into an array by using Object.values 
             * You can flatten the array by using  concat and spread syntax. 
             * Use filter to get only the string
             */
            // const food = [].concat(...Object.values(parameters)).filter(isNaN);
            // async.eachSeries(food, (foodName) => {
            //     Food.find({ sTitle: foodName }, (error, result) => {
            //         nPrice = nPrice + result[0].nPrice;
            //         User.findOneAndUpdate({ sFacebookId: sender }, {
            //             $push: {
            //                 aCart: {
            //                     "sName": foodName,
            //                     "nPrice": result[0].nPrice
            //                 }
            //             }
            //         },(err,result)=>{
            //             console.log(result);

            //         })
            //     });
            // });
            break;
        default:
            sendTextMessage(sender, responseText);
            break;
    }
}


/*
 * handle Message Type for DialogFlow 
 */

function handleMessage(message, sender) {
    switch (message.type) {
        case 0: //text
            sendTextMessage(sender, message.speech);
            break;
        case 2: //quick replies
            let replies = [];
            for (var b = 0; b < message.replies.length; b++) {
                let reply = {
                    content_type: "text",
                    title: message.replies[b],
                    payload: message.replies[b]
                };
                replies.push(reply);
            }
            sendQuickReply(sender, message.title, replies);
            break;
        case 3: //image
            sendImageMessage(sender, message.imageUrl);
            break;
        case 4:
            // custom payload
            var messageData = {
                recipient: {
                    id: sender
                },
                message: message.payload.facebook
            };
            callSendAPI(messageData)
            break;
    }
}


/**
 * Handle Generic card template For facebook Messanger
 */
async function handleCardMessages(messages, sender) {
    let elements = [];
    for (var m = 0; m < messages.length; m++) {
        let message = messages[m];
        let buttons = [];
        for (var b = 0; b < message.buttons.length; b++) {
            let isLink = message.buttons[b].postback.substring(0, 4) === "http";
            let button;
            if (isLink) {
                button = {
                    type: "web_url",
                    title: message.buttons[b].text,
                    url: message.buttons[b].postback
                };
            } else {
                button = {
                    type: "postback",
                    title: message.buttons[b].text,
                    payload: message.buttons[b].postback
                };
            }
            buttons.push(button);
        }

        let element = {
            title: message.title,
            image_url: message.imageUrl,
            subtitle: message.subtitle,
            buttons: buttons
        };
        elements.push(element);
    }
    await sendGenericMessage(sender, elements);
}

/**
 * Handle DialogFlow Responses based On action , paramenters and all....
 */
function handleApiAiResponse(sender, response) {
    let responseText = response.result.fulfillment.speech;
    let responseData = response.result.fulfillment.data;
    let messages = response.result.fulfillment.messages;
    let action = response.result.action;
    let contexts = response.result.contexts;
    let parameters = response.result.parameters;

    sendTypingOff(sender);

    if (
        isDefined(messages) &&
        ((messages.length == 1 && messages[0].type != 0) || messages.length > 1)
    ) {
        let timeoutInterval = 1500;
        let previousType;
        let cardTypes = [];
        let timeout = 0;
        for (var i = 0; i < messages.length; i++) {
            if (
                previousType == 1 &&
                (messages[i].type != 1 || i == messages.length - 1)
            ) {
                timeout = (i - 1) * timeoutInterval;
                setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
                cardTypes = [];
                timeout = i * timeoutInterval;
                setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
            } else if (messages[i].type == 1 && i == messages.length - 1) {
                cardTypes.push(messages[i]);
                timeout = (i - 1) * timeoutInterval;
                setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
                cardTypes = [];
            } else if (messages[i].type == 1) {
                cardTypes.push(messages[i]);
            } else {
                timeout = i * timeoutInterval;
                setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
            }

            previousType = messages[i].type;
        }
    } else if (responseText == "" && !isDefined(action)) {
        //api ai could not evaluate input.
        console.log("Unknown query" + response.result.resolvedQuery);
        sendTextMessage(
            sender,
            "I'm not sure what you want. Can you be more specific?"
        );
    } else if (isDefined(action)) {
        handleApiAiAction(sender, action, responseText, contexts, parameters);
    } else if (isDefined(responseData) && isDefined(responseData.facebook)) {
        try {
            console.log("Response as formatted message" + responseData.facebook);
            sendTextMessage(sender, responseData.facebook);
        } catch (err) {
            sendTextMessage(sender, err.message);
        }
    } else if (isDefined(responseText)) {
        sendTextMessage(sender, responseText);
    }
}

/**
 * Send Messages to DialogFlow
 */
function sendToApiAi(sender, text) {

    sendTypingOn(sender);
    if (!sessionIds.has(sender)) {
        sessionIds.set(sender, uuid.v1());
    }
    let apiaiRequest = apiAiService.textRequest(text, {
        sessionId: sessionIds.get(sender)
    });

    apiaiRequest.on("response", response => {
        if (isDefined(response.result)) {
            handleApiAiResponse(sender, response);
        }
    });

    apiaiRequest.on("error", error => console.error(error));
    apiaiRequest.end();
}

/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
    console.log(event);

    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback
    // button for Structured Messages.
    var payload = event.postback.payload;
    console.log(payload.indexOf(' ') !== -1);
    if (payload.indexOf(' ') !== -1) {
        sendToApiAi(senderID, payload);
    } else {
        handleApiAiAction(senderID, payload, "", "", "")
    }


    console.log(
        "Received postback for user %d and page %d with payload '%s' " + "at %d",
        senderID,
        recipientID,
        payload,
        timeOfPostback
    );

}

/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 * 
 */
function receivedMessageRead(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    // All messages before watermark (a timestamp) or sequence have been seen.
    var watermark = event.read.watermark;
    var sequenceNumber = event.read.seq;
    console.log(
        "Received message read event for watermark %d and sequence " + "number %d",
        watermark,
        sequenceNumber
    );

}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 * 
 */
function receivedAccountLink(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;

    var status = event.account_linking.status;
    var authCode = event.account_linking.authorization_code;

    console.log(
        "Received account link event with for user %d with status %s " +
        "and auth code %s ",
        senderID,
        status,
        authCode
    );
}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var delivery = event.delivery;
    var messageIDs = delivery.mids;
    var watermark = delivery.watermark;
    var sequenceNumber = delivery.seq;
    if (messageIDs) {
        messageIDs.forEach(function (messageID) {
            console.log(
                "Received delivery confirmation for message ID: %s",
                messageID
            );

        });
    }
    console.log("All message before %d were delivered.", watermark);

}

// Spin up the server
app.listen(app.get("port"), function () {
    console.log("Magic Started on port", app.get("port"));
});
