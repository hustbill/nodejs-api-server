/**
 * Asset DAO class.
 */

var util = require('util');
var async = require('async');
var DAO = require('./DAO.js');
var u = require('underscore');

function Autoship_adjustment(context) {
    DAO.call(this, context);
}

util.inherits(Autoship_adjustment, DAO);

Autoship_adjustment.prototype.createAdjustment = function (postData, callback) {
    this.readModels.AutoshipAdjustment.create(postData).done(callback);
};

Autoship_adjustment.prototype.eidtAdjustmentActive = function (postData, callback) {
    this.readModels.AutoshipAdjustment.find({
    	where : {
    		id : postData.id
    	}
    }).done(function(error, adjustment){
    	if (error) {
    		callback(error);
    	};
    	adjustment.active  = u.isBoolean(postData.active) ? postData.active : (postData.active === 'true');
    	adjustment.save().done(function(error, result){
    		callback(error, result);
    	});
    });
};

Autoship_adjustment.prototype.eidtAdjustment = function (postData, callback) {
	var self = this;
    this.readModels.AutoshipAdjustment.find({
    	where : {
    		id : postData.id
    	}
    }).done(function(error, adjustment){
    	if (error) {
    		callback(error);
    	};
    	
    	var dataActive;
    	if (u.isUndefined(postData['active'])) {
    		dataActive = adjustment.active;
    	} else {
    		dataActive = u.isBoolean(postData.active) ? postData.active : (postData.active === 'true');
    	}

    	adjustment.active = false;
    	adjustment.save().done(function(){
    		self.createAdjustment({
	    		active : dataActive,
	            autoship_id : postData['autoship_id'] || adjustment.autoship_id,
	            amount : postData['amount'] || adjustment.amount,
	            label : postData['label'] || adjustment.label
	    	}, callback);
    	});
    });
};

module.exports = Autoship_adjustment;
