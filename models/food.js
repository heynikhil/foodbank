const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const debug = require("debug")("http");

const Food = new Schema({
    sType:String,
    sTitle:String,
    sSubTitle:String,
    sPostback:String,
    nPrice:Number,
    sImage:String
});

module.exports = mongoose.model('food', Food);