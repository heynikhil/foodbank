const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const debug = require("debug")("http");

const User = new Schema({
    sFacebookId: String,
    sFacebookName: String,
    sFacebookGender: String,
    aCart: [{
        sReceiptId: String,
        sItem: [String],
        sImage: [String],
        nPrice: Number,
        nQuantity: { type: Number, default: 1 },
        eDeliveryStatus: {
            type: String,
            enum: ["y", "n"],
            default: "n"
        },
        dTimestamp: {
            type: Date,
            default: Date.now
        },
    }],
    aUserInfo:{
        sAddress1:String,
        sAddress2:String,
        nMobile:Number,
        sCity:String,
        nPincode:Number,
        sCountry:{
            type:String,
            default:"IN"
        },
        sNotice:String
    },
    eStatus: {
        type: String,
        enum: ["i", "n","r"],
        default: "n"
        // r => received Order
        // i => in Cart
    },
    dCreatedDate: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('user', User);