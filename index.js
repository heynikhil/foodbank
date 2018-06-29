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
const ejs = require('ejs');
const randomstring = require("randomstring");
var frameguard = require('frameguard')

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
app.use(express.static(__dirname + '/public'));
app.use('/public', express.static(__dirname + '/public'));
// Process application/x-www-form-urlencoded
app.use(
    bodyParser.urlencoded({
        extended: true
    })
);
// Process application/json
app.use(bodyParser.json());


// Define the URLs we'll allow.
var ALLOWED_BY = new Set([
    'https://facebook.com',
    'https://messanger.com'
])
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

app.get('/checkout/:id', async (req, res) => {
    var senderd = req.params.id;
    var foodName = [];
    var nPrice = [];
    var sImage = [];
    await User.findOne({ sFacebookId: senderd }, async (error, result) => {
        result.aCart.forEach(el => {
            el.sItem.forEach(el2 => {
                foodName.push(el2)
            });
        })
        await Food.find({ sTitle: { $in: foodName } }, async (error, result) => {
            await result.forEach(el => {
                sImage.push(el.sImage);
                nPrice.push(el.nPrice);
            })
        })
        await console.log(foodName);
        await console.log(nPrice);
        await console.log(sImage);
        let referer = req.get('Referer');
        if (referer) {
            cli.blue(referer)
            if (referer.indexOf('messenger') >= 0) {
                res.setHeader('Content-Security-Policy', 'frame-ancestors https://www.messenger.com/');
            } else if (referer.indexOf('facebook') >= 0) {
                res.setHeader('Content-Security-Policy', 'frame-ancestors https://www.facebook.com/');
            }
            res.render('checkout', {
                food: foodName,
                price: nPrice,
                image: sImage
            });
        }
        await console.log("Done");
    })
});

app.post('/checkout', (req, res) => {
    console.log(req.body);
    var psid = req.body.psid;
    User.findOne({ sFacebookId: psid }, (error, result) => {
        let data = result.aUserInfo;
        data.sAddress1 = req.body.sAddress1
        data.sAddress2 = req.body.sAddress2
        data.nMobile = req.body.nMobile
        data.sCity = req.body.sCity
        data.nPincode = req.body.nPincode
        data.sNotice = req.body.sNotice
        result.eStatus = "r"
        result.save();
        var responseText = "Your order is Successfully received.";
        var buttons = [
            {
                "type": "postback",
                "title": "See Receipt",
                "payload": "VIEWRECEIPT"
            }
        ]
        sendButtonMessage(psid, responseText, buttons)
    })
})

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
    function sendCartView(sender) {
        setTimeout(async () => {
            /**
             * Check if cart has active status then send the cart response
             */
            await User.findOne({ $and: [{ sFacebookId: sender }, { eStatus: "i" }] }
                , (error, result) => {
                    if (result === null) {
                        EmptyCart(sender)
                        return false
                    }
                    console.log(result);
                    var responseText = "You have " + "*" + result.aCart[0].sItem.join(', ') + "*" + " in your Cart, and Your total amount is " + "_" + "₹" + result.aCart[0].nPrice + "_";
                    var replies = [{
                        "content_type": "text",
                        "title": "Checkout",
                        "payload": "Checkout please",
                    }, {
                        "content_type": "text",
                        "title": "Add More Food",
                        "payload": "Add More Food",
                    }, {
                        "content_type": "text",
                        "title": "Clear Cart",
                        "payload": "Clear Cart please",
                    }];
                    sendQuickReply(sender, responseText, replies);
                })
        }, 1000);
    }
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

    function EmptyCart(sender) {
        var responseText = "Your cart is *EMPTY* \n\nYou shoud add something from Menu in your cart";
        var replies = [{
            "content_type": "text",
            "title": "Browse Food 🍕 🍔",
            "payload": "Browse Food",
        }]
        sendQuickReply(sender, responseText, replies)
    }
    function foodTyped(action, parameters, sender) {
        console.log(parameters);
        var type = parameters["foodType"];
        if (action === "PIZZAMORE" || type === "pizza") {
            cli.magenta("IN ELSE IFFF 1")
            var elements = [];
            Food.find({ sType: "pizza" }, (error, result) => {
                result.forEach(el => {
                    elements.push({
                        "title": el.sTitle + " " + "₹" + el.nPrice,
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
                        "title": el.sTitle + " " + "₹" + el.nPrice,
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
                        "title": el.sTitle + " " + "₹" + el.nPrice,
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
        } else if (parameters.foodType.length >= 1) {
            cli.magenta("IN IFFF");
            async.eachSeries(type, async (foodType) => {
                var elements = [];
                await Food.find({ sType: foodType }, async (error, result) => { // ["bureger","pizza"]
                    result.forEach(el => {
                        elements.push({
                            "title": el.sTitle + " " + "₹" + el.nPrice,
                            "subtitle": el.sSubTitle,
                            "imageUrl": el.sImage,
                            "buttons": [{
                                "text": "Add to Cart",
                                "postback": el.sPostback
                            }]
                        })
                    })
                    var responseText = "Here is the Menu of " + "*" + foodType + "*";
                    await sendTextMessage(sender, responseText)
                    await handleCardMessages(elements, sender)
                })
            })
            /*
            To give all value in One slider
                Food.find({ sType: { $in: type } }, (error, result) => { // ["bureger","pizza"]
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
                */
        }
        else {
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
            console.log(parameters);
            if (Object.keys(parameters).length === 0) {
                var elements = [];
                FoodTypes.find({}, async (error, result) => { // ["bureger","pizza"]
                    result.forEach(el => {
                        elements.push({
                            "title": el.sTitle,
                            "subtitle": el.sSubTitle,
                            "imageUrl": el.sImage,
                            "buttons": [{
                                "text": "view More",
                                "postback": el.sPostback
                            }]
                        })
                    })
                    var responseText = "Here is the Menu of *Burger*, *Pizza* and *Sandwich*";
                    await sendTextMessage(sender, responseText)
                    await handleCardMessages(elements, sender)
                })
            }
            else if (parameters.foodType.length > 0) {
                foodContent(parameters, sender)
            }
            break;

        case "food-more-type":
        case "PIZZAMORE":
        case "BURGERMORE":
        case "SENDWHICHMORE":
            foodTyped(action, parameters, sender)
            break;
        case "food-add-cart":

            cli.red("Add To Cart");
            let nPrice = [];
            let sImage = [];
            /**
             * Convert the object into an array by using Object.values 
             * You can flatten the array by using  concat and spread syntax. 
             * Use filter to get only the string
             */
            const cart = [].concat(...Object.values(parameters)).filter(isNaN);
            const nQuantity = parameters.number;

            /**
             * If cart is empty then Give message to add some food
             */
            if (cart.length <= 0) {
                EmptyCart(sender)
                return false;
            }

            /**
             * If cart has some value then search for price and othe data
             */
            Food.find({ sTitle: { $in: cart } }, async (error, result) => {
                console.log(result);
                // ["bureger","pizza"]
                result.forEach(el => {
                    nPrice.push(el.nPrice);
                });
                result.forEach(el => {
                    sImage.push(el.sImage)
                });
                // Generate unique receipt id
                const sReceiptId = randomstring.generate({
                    length: 12,
                    charset: 'alphabetic'
                });;

                //make the total of the cart
                var sTotal = nPrice.reduce(function (a, b) { return a + b; }, 0);

                // Generate cart payload to add in DB
                var c = {
                    sImage: sImage,
                    sItem: cart,
                    nPrice: sTotal,
                    sReceiptId: sReceiptId,
                    nQuantity: cart.length,
                }

                /**
                 * To Find the cart is empty or have some data and according to it add iteams in cart
                 */
                await User.findOne({ sFacebookId: sender }, (error, result2) => {
                    result2.eStatus = "i";
                    result2.aCart.forEach(el => {
                        if (el.eDeliveryStatus == 'n') {
                            el.sItem.push(cart);
                            el.sImage.push(sImage)
                            el.nPrice = el.nPrice + sTotal;
                            el.nQuantity = cart.length + el.nQuantity;
                            result2.save();

                        } else {
                            result2.eStatus = "i";
                            result2.aCart = c;
                            result2.save();
                        }
                    })
                    if (result2.aCart.length <= 0) {
                        result2.eStatus = "i";
                        result2.aCart = c;
                        result2.save();
                    }
                }); sendCartView(sender);
            })
            break;

        case "Food-view-cart":
            sendCartView(sender)
            break;

        case "food-cart.add-context:delivery-add":
            var elements = [];
            FoodTypes.find({}, async (error, result) => { // ["bureger","pizza"]
                result.forEach(el => {
                    elements.push({
                        "title": el.sTitle,
                        "subtitle": el.sSubTitle,
                        "imageUrl": el.sImage,
                        "buttons": [{
                            "text": "view More",
                            "postback": el.sPostback
                        }]
                    })
                })
                var responseText = "Here is the Menu of *Burger*, *Pizza* and *Sandwich*";
                await sendTextMessage(sender, responseText)
                await handleCardMessages(elements, sender)
            })
            break;

        case "food-checkout":
            User.findOne({ $and: [{ sFacebookId: sender }, { eStatus: "i" }] }, (error, result) => {
                if (result !== null) {
                    var responseText = "Are you sure you want to checkout?"
                    var buttons = [{
                        type: "web_url",
                        url: constant.SERVER_URL + "/checkout/" + sender,
                        title: "Yes",
                        webview_height_ratio: "tall",
                        messenger_extensions: true
                    },
                    {
                        type: "postback",
                        "title": "no",
                        "payload": "No not right now"
                    }
                    ]
                    sendButtonMessage(sender, responseText, buttons)
                } else {
                    EmptyCart(sender)
                }
            })
            break;

        case "food-checkout.food-checkout-no":
            var responseText = "Don't worry you have your food in your cart you can checkout anytime";
            sendTextMessage(sender, responseText);
            break;

        case "food-checkout.food-checkout-yes":
            console.log(parameters);
            console.log(contexts);
            break;

        case "food-clear-card":
            User.findOne({
                $and: [
                    { sFacebookId: sender },
                    { aCart: { '$elemMatch': { "eDeliveryStatus": 'n' } } }
                ]
            }, (error, result) => {
                console.log(result);
                if (result == null) {
                    EmptyCart(sender)
                } else {
                    console.log(result);
                    result.eStatus = "n"
                    result.aCart = [];
                    result.save();
                    (async function foo() {
                        var responseText = "Sure, I just Cleard your cart."
                        await sendTextMessage(sender, responseText);
                        await EmptyCart(sender)
                    }());
                }
            })
            break;

        case "VIEWRECEIPT":
            let recipient_name;
            let currency = "INR";
            let payment_method = "COD";
            let timestamp = Math.floor(Date.now() / 1000);
            let summary = [];
            let elementRec = []
            let adjustments = [{
                "name": "No Coupon",
                "amount": 0.01
            }];
            let order_url = "https://37cf1e51.ngrok.io";
            // var summary = {}
            User.findOne({ $and: [{ sFacebookId: sender }, { eStatus: "r" }] }, async (error, result) => {
                recipient_name = result.sFacebookName;
                //timestamp = result.aCart[0].dTimestamp
                // elementRec = data.reduce((r, { sItem, sImage, nQuantity: quantity, nPrice: price }) =>
                //     r.concat(sItem.map((title, i) => ({
                //         title, subTitle: title, quantity, price, currency: 'INR', image_url: sImage[i]
                //     }))),
                //     []
                // );
                console.log(result.aCart);

                result.aCart.forEach(el => {
                    el.sItem.forEach((el2, index) => {
                        elementRec.push({
                            "title": el2,
                            "subtitle": el2,
                            "quantity": 1,
                            "price": el.nPrice,
                            "currency": "INR",
                            "image_url": el.sImage[index]
                        })
                    });
                    summary.push({
                        "subtotal": el.nPrice,
                        "shipping_cost": 0,
                        "total_tax": 0.00,
                        "total_cost": el.nPrice
                    })
                });
                let receiptId = result.aCart[0].sReceiptId

                let address = {
                    "street_1": result.aUserInfo.sAddress1,
                    "street_2": result.aUserInfo.sAddress2,
                    "city": result.aUserInfo.sCity,
                    "postal_code": result.aUserInfo.nPincode,
                    "state": "Gujarat",
                    "country": "IN"
                };
                sendReceiptMessage(sender,
                    recipient_name,
                    currency,
                    payment_method,
                    timestamp,
                    elementRec,
                    address,
                    ...summary,
                    adjustments,
                    order_url, receiptId);
            })











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
