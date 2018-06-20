const { callSendAPI } = require('./api');
const request = require('request');
const constant = require('../config/constant');
const cli = require('../config/cli').console;
const User = require('../models/user')

const isDefined = (obj) => {
    if (typeof obj == "undefined") {
        return false;
    }
    if (!obj) {
        return false;
    }
    return obj != null;
}

/**
 * Send Image or video using the Send API
 * @param {number} recipientId Unique Facebood ID
 * @param {object} elements payload that contains element
 */
const sendFbImageVideo = (recipientId, elements) => {
    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "media",
                    elements: elements
                }
            }
        }
    };
    callSendAPI(messageData)
}
/**
 * Send text message using the Send API
 * @param {number} recipientId Unique Facebood ID
 * @param {string} text the text message
 */
const sendTextMessage = async (recipientId, text) => {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text
        }
    };

    await callSendAPI(messageData);
}

/*
 * Send an image using the Send API.
 *
 */
const sendImageMessage = async (recipientId, imageUrl) => {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: imageUrl
                }
            }
        }
    };

    await callSendAPI(messageData);
}


/*
 * Send a button message using the Send API.
 *
 */
const sendButtonMessage = async (recipientId, text, buttons) => {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: text,
                    buttons: buttons
                }
            }
        }
    };

    await callSendAPI(messageData);
}

/*
 * Send a Generic template message using the Send API.
 *
 */
const sendGenericMessage = async (recipientId, elements) => {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements: elements
                }
            }
        }
    };
    await callSendAPI(messageData);
}

/**
 * send receipt after payment
 */
const sendReceiptMessage = async (
    recipientId,
    recipient_name,
    currency,
    payment_method,
    timestamp,
    elements,
    address,
    summary,
    adjustments,
    order_url
) => {
    // Generate a random receipt ID as the API requires a unique ID
    var receiptId = "order" + Math.floor(Math.random() * 1000);

    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "receipt",
                    recipient_name: recipient_name,
                    order_number: receiptId,
                    currency: currency,
                    payment_method: payment_method,
                    order_url: order_url,
                    timestamp: timestamp,
                    address: address,
                    summary: summary,
                    adjustments: adjustments,
                    elements: elements,
                }
            }
        }
    };

    await callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
const sendQuickReply = (recipientId, text, replies, metadata) => {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text,
            metadata: isDefined(metadata) ? metadata : "",
            quick_replies: replies
        }
    };

    callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
const sendReadReceipt = async (recipientId) => {
    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "mark_seen"
    };

    await callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
const sendTypingOn = (recipientId) => {
    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_on"
    };
    callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
const sendTypingOff = (recipientId) => {
    var messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: "typing_off"
    };

    callSendAPI(messageData);
}


const greetUserText = async (userId) => {
    //first read user firstname
    await request(
        {
            uri: "https://graph.facebook.com/v2.8/" + userId,
            qs: {
                access_token: constant.FB_PAGE_TOKEN
            }
        },
        (error, response, body) => {
            console.log(body);

            if (!error && response.statusCode == 200) {
                var user = JSON.parse(body);

                if (user.first_name) {
                    console.log(
                        "FB user: %s %s, %s",
                        user.first_name,
                        user.last_name,
                        user.gender
                    );
                    async function sendGreet() {
                        await sendTextMessage(userId, "Welcome " + user.first_name + " " + user.last_name + " 😀 " + "! " + " We offers sophisticated cuisine that gives a decidedly modern twist to classic techniques.");
                        await sendTextMessage(userId, "I can help you with your shopping needs, update you with order/delivery status, send exclusive offers etc.");
                        var responseText = "Tap below to see what we offer"
                        var replies = [{
                            "content_type": "text",
                            "title": "Browse Food 🍕 🍔",
                            "payload": "Browse Food",
                        }];
                        await sendQuickReply(userId, responseText, replies);
                    }
                    sendGreet();
                    var query = { sFacebookId: userId },
                        update = { dUpdatedDate: new Date() },
                        options = { upsert: true, new: true, setDefaultsOnInsert: true };

                    // Find the document
                    User.findOneAndUpdate(query, update, options, function (error, result) {
                        if (error) return;
                        if (result) {
                            result.sFacebookName = user.first_name + " " + user.last_name;
                            result.sFacebookGender = user.gender;
                            result.save()
                        }
                    });
                } else {
                    console.log("Cannot get data for fb user with id", userId);
                }
            } else {
                console.error(response.error);
            }
        }
    );
}


module.exports = {
    sendTextMessage,
    sendImageMessage,
    sendButtonMessage,
    sendGenericMessage,
    sendReceiptMessage,
    sendQuickReply,
    sendReadReceipt,
    sendTypingOn,
    sendTypingOff,
    greetUserText,
    isDefined,
    sendFbImageVideo
}