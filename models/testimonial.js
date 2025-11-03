//jshint esversion:6
const mongoose = require('mongoose');

let testimonialSchema = mongoose.Schema({
    testimonialid:{
        type:Number,
        required: 'Enter ID',
        unique: true
    },
    tenantname:{
        type:String,
        required:'Tenant name is required !'
    },
    occupation:{
        type:String
    },
    propertyname:{
        type:String,
        required: 'Property name is required !'
    },
    tenantdesc:{
        type:String
    },
    tenantsat:{
        type:String,
        required:'Satisfaction is required !'
    }

});

let Testimonial = module.exports = mongoose.model('Testimonial',testimonialSchema,'testimonial');
