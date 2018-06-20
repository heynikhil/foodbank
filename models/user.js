const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const debug = require("debug")("http");

const User = new Schema({
    sFacebookId: String,
    sFacebookName: String,
    sFacebookGender: String,
    aCart: [{
        sName: String,
        nPrice: Number,
        nQuantity: {type:Number, default:1}
    }],

    eStatus: {
        type: String,
        enum: ["y", "n"],
        default: "n"
    },
    dCreatedDate: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('user', User);