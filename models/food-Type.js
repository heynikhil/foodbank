const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const debug = require("debug")("http");

const FoodType = new Schema({
    sType: String,
    sTitle: String,
    sSubTitle: String,
    sPostback: String,
    sImage: String
});

module.exports = mongoose.model('food_type', FoodType);