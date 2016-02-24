var async = require('async');
var AddressService = require('./address-service');
var TaxService = require('./tax-service');
var daos = require('../../daos');
var statsdHelper = require('../../lib/statsdHelper');


var avalaraClient = null;

function createClient(options, callback) {
    var avalaraOptions = {},
        avalaraClient = {};

    if (!options) {
        callback(new Error('Param `options` is required.'));
    }
    avalaraOptions.webAddress = options.webAddress;
    avalaraOptions.username = options.username;
    avalaraOptions.password = options.password;

    async.waterfall([
        function (callback) {
            AddressService.createService(avalaraOptions, function (err, service) {
                if (err) {
                    callback(err);
                    return;
                }
                avalaraClient.addressService = service;
                callback();
            });
        },

        function (callback) {
            TaxService.createService(avalaraOptions, function (err, service) {
                if (err) {
                    callback(err);
                    return;
                }
                avalaraClient.taxService = service;
                callback();
            });
        },

        function (callback) {
            callback(null, avalaraClient);
        }
    ], callback);
}


function getClient(context, callback) {
    if (avalaraClient) {
        callback(null, avalaraClient);
        return;
    }

    var avalaraConfig = context.config.avalara,
        options = {
            webAddress : avalaraConfig.webAddress,
            username : avalaraConfig.username,
            password : avalaraConfig.password
        };
    createClient(options, function (error, client) {
        if (error) {
            callback(error);
            return;
        }
        avalaraClient = client;
        callback(null, client);
    });
}


function finishAvalaraRequestStat(stat, error, result) {
    var statResult;

    if (error) {
        statResult = 'failed';
    } else if (result.ResultCode === 'Success') {
        statResult = 'succeeded';
    } else {
        statResult = 'failed';
    }

    stat.finishStat(statResult);
}


function getAddressData(context, address, callback) {
    var data = {
        Line1 : address.address1,
        Line2 : address.address2,
        City : address.city,
        PostalCode : address.zipcode,
    };

    async.waterfall([
        function (callback) {
            var addressDao = daos.createDao('Address', context);
            addressDao.getStateOfAddress(address, callback);
        },

        function (state, callback) {
            data.Region = state.abbr;
            callback(null, data);
        }
    ], callback);
}


function getTaxAddressesData(context, order, callback) {
    var shippingAddress = order.shippingAddress,
        addresses = [];

    async.waterfall([
        function (callback) {
            getAddressData(context, order.shippingAddress, callback);
        },

        function (addressData, callback) {
            addressData.AddressCode = 'd';
            addresses.push(addressData);
            callback();
        },

        function (callback) {
            var orderDao = daos.createDao('Order', context);
            orderDao.getWarehouseOfOrder(order, callback);
        },

        function (warehouse, callback) {
            var warehouseDao = daos.createDao('Warehouse', context);
            warehouseDao.getAddressOfWarehouse(warehouse, callback);
        },

        function (addressOfWarehouse, callback) {
            getAddressData(context, addressOfWarehouse, callback);
        },

        function (addressData, callback) {
            addressData.AddressCode = 'o';
            addresses.push(addressData);

            callback(null, addresses);
        }
    ], callback);
}


function getLinesDataOfItem(context, lineItem, quantity, callback) {
    var lines = [];

    async.waterfall([
        function (callback) {
            var productBomDao = daos.createDao('ProductBom', context);
            productBomDao.getProductBomsByVariantId(lineItem.variant_id, callback);
        },

        function (productBoms, callback) {
            var variantDao,
                lineItemDao,
                variant;
            if (productBoms.length === 0) {
                lineItemDao = daos.createDao('LineItem', context);
                lineItemDao.getVariantOfLineItem(lineItem, function (error, variant) {
                    if (error) {
                        callback(error);
                        return;
                    }

                    lines.push({
                        DestinationCode : 'd',
                        OriginCode : 'o',
                        No : lineItem.id + '_' + variant.id + '_' + variant.sku,
                        Qty : quantity,
                        Amount : lineItem.retail_price * quantity,
                        ItemCode : variant.sku || ''
                    });
                    callback(null, lines);
                });
            } else {
                // this is a pack, let's get its products one by one
                variantDao = daos.createDao('Variant', context);
                async.forEachSeries(productBoms, function (productBom, callback) {
                    variantDao.getById(productBom.variantbom_id, function (error, variant) {
                        if (error) {
                            callback(error);
                            return;
                        }

                        variantDao.getVariantRetailPrice(variant, function (error, price) {
                            if (error) {
                                callback(error);
                                return;
                            }

                            lines.push({
                                DestinationCode : 'd',
                                OriginCode : 'o',
                                No : lineItem.id + '_' + variant.id + '_' + variant.sku,
                                Qty : productBom.bomqty * quantity,
                                Amount : productBom.bomqty * price * quantity,
                                ItemCode : variant.sku || ''
                            });

                            callback();
                        });
                    });
                }, function (error) {
                    if (error) {
                        callback(error);
                        return;
                    }
                    callback(null, lines);
                });
            }
        }
    ], callback);
}


function getLinesDataOfItems(context, lineItems, callback) {
    var linesData = [],
        lineItemIndex = 0;

    async.forEachSeries(lineItems, function (eachLineItem, callback) {
        lineItemIndex += 1;
        if (!eachLineItem.id) {
            eachLineItem.id = lineItemIndex;
        }
        getLinesDataOfItem(context, eachLineItem, eachLineItem.quantity, function (error, lines) {
            if (error) {
                callback(error);
            }
            linesData = linesData.concat(lines);
            callback();
        });
    }, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, linesData);
    });
}


function getLinesDataOfShipment(context, order, callback) {
    var logger = context.logger,
        orderDao = daos.createDao('Order', context),
        shipmentTotal = 0,
        line;

    logger.debug("avalara: getting shipment line data of order %d.", order.id);
    async.waterfall([
        function (callback) {
            orderDao.getAdjustmentsOfOrder(order, callback);
        },

        function (adjustments, callback) {
            logger.debug("avalara: adjustments of order %d: %j", order.id, adjustments);
            adjustments.forEach(function (adjustment) {
                if (adjustment.source_type === 'Shipment') {
                    shipmentTotal += adjustment.amount || 0;
                }
            });

            line = {
                DestinationCode : 'd',
                OriginCode : 'o',
                No : 'Shipping',
                Qty : 1,
                Amount : shipmentTotal,
                ItemCode : '9999'
            };

            logger.debug("avalara: shipment line data of order %d: %j", order.id, line);
            callback(null, [line]);
        }
    ], callback);
}


function getTaxRequestDataFromOrder(context, order, callback) {
    var avalaraConfig = context.config.avalara,
        orderDao,
        requestData = {};

    requestData.CompanyCode = avalaraConfig.companyCode || 'OGI';
    requestData.DocCode = order.number;
    requestData.DetailLevel = 'Tax';
    async.waterfall([
        function (callback) {
            orderDao = daos.createDao('Order', context);
            orderDao.getDistributorOfOrder(order, callback);
        },

        function (distributor, callback) {
            requestData.CustomerCode = distributor.id;
            getTaxAddressesData(context, order, callback);
        },

        function (addresses, callback) {
            requestData.Addresses = {BaseAddress : addresses};

            orderDao.getLineItemsOfOrder(order, callback);
        },

        function (lineItems, callback) {
            getLinesDataOfItems(context, lineItems, callback);
        },

        function (lines, callback) {
            requestData.Lines = lines;
            getLinesDataOfShipment(context, order, callback);
        },

        function (lines, callback) {
            requestData.Lines = requestData.Lines.concat(lines);

            requestData.Lines = {Line : requestData.Lines};
            callback(null, requestData);
        }
    ], callback);
}


function parseLineNo(lineNo) {
    var parts = lineNo.split('_');

    return {
        lineItemId : parts[0],
        variantId : parts[1]
    };
}


function getTaxAmountsOfOrderViaTaxUsVariant(context, order, lines, callback) {
    var taxUsVariantDao = daos.createDao('TaxUsVariant', context),
        stateId = order.shippingAddress.state_id,
        result = {
            totalItemTaxAmount : 0,
            shippingTaxAmount : 0,
            lineItemTaxHash : {}
        },
        lineItemTaxHash = result.lineItemTaxHash;

    async.forEachSeries(lines, function (line, callback) {
        var lineNo = line.No,
            lineNoInfo;

        if (lineNo === 'Shipping') {
            async.waterfall([
                function (callback) {
                    taxUsVariantDao.getTaxRate(3000, stateId, callback);
                },

                function (taxRate, callback) {
                    result.shippingTaxAmount = line.Amount * taxRate;
                    callback();
                }
            ], callback);
        } else {
            lineNoInfo = parseLineNo(lineNo);
            async.waterfall([
                function (callback) {
                    taxUsVariantDao.getTaxRate(lineNoInfo.variantId, stateId, callback);
                },

                function (taxRate, callback) {
                    var itemTax = line.Amount * taxRate;
                    result.totalItemTaxAmount += itemTax;

                    if (!lineItemTaxHash[lineNoInfo.lineItemId]) {
                        lineItemTaxHash[lineNoInfo.lineItemId] = 0;
                    }

                    lineItemTaxHash[lineNoInfo.lineItemId] += itemTax;
                    callback();
                }
            ], callback);
        }
    }, function (error) {
        if (error) {
            callback(error);
            return;
        }

        callback(null, result);
    });
}


function getLinesDataOfReturnInvoiceTax(context, inventoryUnits, lineItems, callback) {
    var returnInventoryUnitsHash = {},
        lineItemsToReturn = [],
        linesData = [];

    // group by variantId
    inventoryUnits.forEach(function (inventoryUnit) {
        if (returnInventoryUnitsHash[inventoryUnit.variantId]) {
            returnInventoryUnitsHash[inventoryUnit.variantId] += 1;
        } else {
            returnInventoryUnitsHash[inventoryUnit.variantId] = 1;
        }
    });

    // filter line items
    lineItems.forEach(function (lineItem) {
        var quantity = returnInventoryUnitsHash[lineItem.variantId];
        if (quantity) {
            lineItemsToReturn.push({
                lineItem : lineItem,
                quantity : quantity
            });
        }
    });

    async.forEachSeries(lineItemsToReturn, function (eachReturn, callback) {
        getLinesDataOfItem(context, eachReturn.lineItem, eachReturn.quantity, function (error, lines) {
            if (error) {
                callback(error);
            }

            lines.forEach(function (eachLine) {
                eachLine.amount *= -1;
            });

            linesData = linesData.concat(lines);
            callback();
        });

    }, function (error) {
        if (error) {
            callback(error);
            return;
        }
        callback(null, linesData);
    });
}


function getRequestDataForGetTaxOfReturnInvoice(context, returnAuthorization, order, callback) {
    var avalaraConfig = context.config.avalara,
        requestData = {};

    requestData.CompanyCode = avalaraConfig.companyCode || 'OGI';
    requestData.DocCode = order.number + '.' + returnAuthorization.id;
    requestData.ReferenceCode = order.number;
    requestData.TaxOverrideReason = 'Return Items';

    async.waterfall([
        getClient.bind(this, context),

        function (avalaraClient, callback) {
            var getTaxHistoryRequestData = {
                    CompanyCode : avalaraConfig.companyCode || 'OGI',
                    DocType : 'SalesInvoice',
                    DocCode : order.number
                },
                stat = statsdHelper.beginStat(context, 'avalara.get_tax_history');

            avalaraClient.taxService.getTaxHistory(getTaxHistoryRequestData, function (error, getTaxHistoryResult) {
                finishAvalaraRequestStat(stat, error, getTaxHistoryResult);

                if (error) {
                    callback(error);
                    return;
                }

                callback(null, getTaxHistoryResult);
            });
        },

        function (taxHistory, callback) {
            if (taxHistory.ResultCode === 'Success') {
                requestData.TaxOverrideDate = taxHistory.TaxDate;
            }

            var orderDao = daos.createDao('Order', context);
            orderDao.getDistributorOfOrder(order, callback);
        },

        function (distributor, callback) {
            requestData.CustomerCode = distributor.id;
            getTaxAddressesData(context, order, callback);
        },

        function (addresses, callback) {
            requestData.Addresses = {BaseAddress : addresses};

            var orderDao = daos.createDao('Order', context);
            orderDao.getLineItemsOfOrder(order, callback);
        },

        function (lineItems, callback) {
            getLinesDataOfReturnInvoiceTax(context, returnAuthorization.inventoryUnits, lineItems, callback);
        },

        function (lines, callback) {
            requestData.Lines = {Line : lines};
            callback(null, requestData);
        },
    ], callback);
}


exports.getTaxAmountsOfOrder = function (context, order, callback) {
    var logger = context.logger,
        avalaraClient,
        getTaxRequestData,
        result = {
            shippingTaxAmount : 0,
            totalItemTaxAmount : 0,
            lineItemTaxHash : {}
        },
        lineItemTaxHash = result.lineItemTaxHash;

    async.waterfall([
        getClient.bind(this, context),

        function (client, callback) {
            avalaraClient = client;
            getTaxRequestDataFromOrder(context, order, callback);
        },

        function (requestData, callback) {
            getTaxRequestData = requestData;
            logger.debug("avalara: Getting tax amounts of order %d via avalara...", order.id);
            logger.debug("avalara: requestData: %j", requestData);
            logger.debug("avalara: lines: %j", requestData.Lines.Line);

            var stat = statsdHelper.beginStat(context, 'avalara.get_tax');

            avalaraClient.taxService.getTax(requestData, function (error, getTaxResult) {
                finishAvalaraRequestStat(stat, error, getTaxResult);

                if (error) {
                    callback(error);
                    return;
                }

                callback(null, getTaxResult);
            });
        },

        function (getTaxResult, callback) {
            var taxLines;

            logger.debug("avalara: getTax result for order %d: %j", order.id, getTaxResult);
            if (getTaxResult.ResultCode === 'Success') {
                taxLines = getTaxResult.TaxLines.TaxLine;
                logger.debug("avalara: tax lines for order %d: %j", order.id, taxLines);
                if (!taxLines) {
                    taxLines = [];
                }
                if (!(taxLines instanceof Array)) {
                    taxLines = [taxLines];
                }

                taxLines.forEach(function (taxLine) {
                    var itemTax = parseFloat(taxLine.Tax) || 0,
                        lineNoInfo;

                    if (taxLine.No === 'Shipping') {
                        result.shippingTaxAmount = itemTax;
                    } else {
                        result.totalItemTaxAmount += itemTax;

                        lineNoInfo = parseLineNo(taxLine.No);
                        if (!lineItemTaxHash[lineNoInfo.lineItemId]) {
                            lineItemTaxHash[lineNoInfo.lineItemId] = 0;
                        }

                        lineItemTaxHash[lineNoInfo.lineItemId] += itemTax;
                    }
                });

                callback(null, result);
            } else {
                logger.warn('avalara: Get tax failed:\n%j', getTaxResult);
                getTaxAmountsOfOrderViaTaxUsVariant(context, order, getTaxRequestData.Lines, callback);
            }
        },

        function (result, callback) {
            result.shippingTaxAmount = Math.round(result.shippingTaxAmount * 100) / 100;
            result.totalItemTaxAmount = Math.round(result.totalItemTaxAmount * 100) / 100;

            logger.debug("avalara: Get tax amount result of order %d: %j", order.id, result);
            callback(null, result);
        }
    ], callback);
};

exports.postTaxOfOrder = function (context, order, callback) {
    var logger = context.logger,
        avalaraClient,
        result = {
            taxGet : false,
            taxPost : false
        };

    logger.debug('Posting tax of order(id=%d).', order.id);

    async.waterfall([
        getClient.bind(this, context),

        function (client, callback) {
            avalaraClient = client;
            getTaxRequestDataFromOrder(context, order, callback);
        },

        function (getTaxRequestData, callback) {
            getTaxRequestData.DocType = 'SalesInvoice';
            logger.debug("Getting tax via avalara...");

            var stat = statsdHelper.beginStat(context, 'avalara.get_tax');

            avalaraClient.taxService.getTax(getTaxRequestData, function (error, getTaxResult) {
                finishAvalaraRequestStat(stat, error, getTaxResult);

                if (error) {
                    callback(error);
                    return;
                }

                callback(null, getTaxResult);
            });
        },

        function (getTaxResult, next) {
            if (getTaxResult.ResultCode !== 'Success') {
                result.getTaxResult = getTaxResult;
                callback(null, result);
                return;
            }

            result.taxGet = true;

            var avalaraConfig = context.config.avalara,
                postTaxRequestData = {
                    DocType : 'SalesInvoice',
                    CompanyCode : avalaraConfig.companyCode || 'OGI',
                    DocCode : getTaxResult.DocCode,
                    TotalAmount : getTaxResult.TotalAmount,
                    TotalTax : getTaxResult.TotalTax
                },
                stat = statsdHelper.beginStat(context, 'avalara.post_tax');

            logger.debug("Posting tax to avalara...");

            avalaraClient.taxService.postTax(postTaxRequestData, function (error, postTaxResult) {
                finishAvalaraRequestStat(stat, error, postTaxResult);

                if (error) {
                    callback(error);
                    return;
                }

                next(null, postTaxResult);
            });
        },

        function (postTaxResult, callback) {
            if (postTaxResult.ResultCode === 'Success') {
                result.taxPost = true;
            }
            result.postTaxResult = postTaxResult;
            callback(null, result);
        }
    ], callback);
};


exports.commitSalesInvoice = function (context, order, callback) {
    if (!order.avatax_get) {
        callback();
        return;
    }

    async.waterfall([
        getClient.bind(this, context),

        function (avalaraClient, callback) {
            var avalaraConfig = context.config.avalara,
                commitTaxRequestData = {
                    CompanyCode : avalaraConfig.companyCode || 'OGI',
                    DocType : 'SalesInvoice',
                    DocCode : order.number
                },
                stat = statsdHelper.beginStat(context, 'avalara.commit_tax');

            avalaraClient.taxService.commitTax(commitTaxRequestData, function (error, commitTaxResult) {
                finishAvalaraRequestStat(stat, error, commitTaxResult);

                if (error) {
                    callback(error);
                    return;
                }

                callback(null, commitTaxResult);
            });
        },

        function (commitTaxResult, callback) {
            if (commitTaxResult.ResultCode !== 'Success') {
                var error = new Error('Failed to commit sales invoice. Commit tax failed.');
                error.name = 'AvalaraError';
                error.data = commitTaxResult;
                callback(error);
                return;
            }

            callback();
        }
    ], callback);
};


exports.cancelSalesInvoice = function (context, order, callback) {
    if (!order.avatax_get) {
        callback();
        return;
    }

    async.waterfall([
        getClient.bind(this, context),

        function (avalaraClient, callback) {
            var avalaraConfig = context.config.avalara,
                cancelTaxRequestData = {
                    CompanyCode : avalaraConfig.companyCode || 'OGI',
                    DocType : 'SalesInvoice',
                    DocCode : order.number
                },
                stat = statsdHelper.beginStat(context, 'avalara.cancel_tax');

            avalaraClient.taxService.cancelTax(cancelTaxRequestData, function (error, cancelTaxResult) {
                finishAvalaraRequestStat(stat, error, cancelTaxResult);

                if (error) {
                    callback(error);
                    return;
                }

                callback(null, cancelTaxResult);
            });
        },

        function (cancelTaxResult, callback) {
            if (cancelTaxResult.ResultCode !== 'Success') {
                var error = new Error('Failed to cancel sales invoice. Cancel tax failed.');
                error.name = 'AvalaraError';
                error.data = cancelTaxResult;
                callback(error);
                return;
            }

            callback();
        }
    ], callback);
};


exports.createReturnInvoice = function (context, returnAuthorization, order, callback) {
    var avalaraClient,
        error;

    async.waterfall([
        getClient.bind(this, context),

        function (client, callback) {
            avalaraClient = client;
            getRequestDataForGetTaxOfReturnInvoice(context, returnAuthorization, order, callback);
        },

        function (requestData, callback) {
            var stat = statsdHelper.beginStat(context, 'avalara.get_tax');

            avalaraClient.taxService.getTax(requestData, function (error, getTaxResult) {
                finishAvalaraRequestStat(stat, error, getTaxResult);

                if (error) {
                    callback(error);
                    return;
                }

                callback(null, getTaxResult);
            });
        },

        function (getTaxResult, callback) {
            if (getTaxResult.ResultCode !== 'Success') {
                error = new Error('Failed to create return invoice. Get tax failed.');
                error.name = 'AvalaraError';
                error.data = getTaxResult;
                callback(error);
                return;
            }

            var avalaraConfig = context.config.avalara,
                postTaxRequestData = {
                    DocType : 'SalesInvoice',
                    CompanyCode : avalaraConfig.companyCode || 'OGI',
                    DocCode : getTaxResult.DocCode,
                    TotalAmount : getTaxResult.TotalAmount,
                    TotalTax : getTaxResult.TotalTax
                },
                stat = statsdHelper.beginStat(context, 'avalara.post_tax');

            avalaraClient.taxService.postTax(postTaxRequestData, function (error, postTaxResult) {
                finishAvalaraRequestStat(stat, error, postTaxResult);

                if (error) {
                    callback(error);
                    return;
                }

                callback(null, postTaxResult);
            });
        },

        function (postTaxResult, callback) {
            if (postTaxResult.ResultCode !== 'Success') {
                error = new Error('Failed to create return invoice. Post tax failed.');
                error.name = 'AvalaraError';
                error.data = postTaxResult;
                callback(error);
                return;
            }

            callback(null, postTaxResult);
        }
    ], callback);
};


exports.commitReturnInvoice = function (context, returnAuthorization, order, callback) {
    var avalaraConfig = context.config.avalara,
        avalaraClient,
        docCode = order.number + '.' + returnAuthorization.id,
        docType = 'ReturnInvoice',
        error;

    async.waterfall([
        getClient.bind(this, context),

        function (client, callback) {
            avalaraClient = client;

            var getTaxHistoryRequestData = {
                    CompanyCode : avalaraConfig.companyCode || 'OGI',
                    DocType : docType,
                    DocCode : docCode
                },
                stat = statsdHelper.beginStat(context, 'avalara.get_tax_history');

            avalaraClient.taxService.getTaxHistory(getTaxHistoryRequestData, function (error, getTaxHistoryResult) {
                finishAvalaraRequestStat(stat, error, getTaxHistoryResult);

                if (error) {
                    callback(error);
                    return;
                }

                callback(null, getTaxHistoryResult);
            });
        },

        function (getTaxHistoryResult, callback) {
            if (getTaxHistoryResult.ResultCode !== 'Success') {
                error = new Error('Failed to commit return invoice. Get tax history failed.');
                error.name = 'AvalaraError';
                error.data = getTaxHistoryResult;
                callback(error);
                return;
            }

            if (getTaxHistoryResult.DocStatus !== 'Saved') {
                callback();
                return;
            }

            // tax is not posted. post now.
            var postTaxRequestData = {
                    DocType : docType,
                    CompanyCode : avalaraConfig.companyCode || 'OGI',
                    DocCode : docCode,
                    TotalAmount : getTaxHistoryResult.TotalAmount,
                    TotalTax : getTaxHistoryResult.TotalTax
                },
                stat = statsdHelper.beginStat(context, 'avalara.post_tax');

            avalaraClient.taxService.postTax(postTaxRequestData, function (error, postTaxResult) {
                finishAvalaraRequestStat(stat, error, postTaxResult);

                if (error) {
                    callback(error);
                    return;
                }

                if (postTaxResult.ResultCode !== 'Success') {
                    error = new Error('Failed to commit return invoice. Post tax failed.');
                    error.name = 'AvalaraError';
                    error.data = postTaxResult;
                    callback(error);
                    return;
                }

                callback();
            });
        },

        function (callback) {
            // commit tax
            var commitTaxRequestData = {
                    CompanyCode : avalaraConfig.companyCode || 'OGI',
                    DocType : docType,
                    DocCode : docCode
                },
                stat = statsdHelper.beginStat(context, 'avalara.commit_tax');

            avalaraClient.taxService.commitTax(commitTaxRequestData, function (error, commitTaxResult) {
                finishAvalaraRequestStat(stat, error, commitTaxResult);

                if (error) {
                    callback(error);
                    return;
                }

                callback(null, commitTaxResult);
            });
        },

        function (commitTaxResult, callback) {
            if (commitTaxResult.ResultCode !== 'Success') {
                error = new Error('Failed to commit return invoice. Commit tax failed.');
                error.name = 'AvalaraError';
                error.data = commitTaxResult;
                callback(error);
                return;
            }

            callback(null, commitTaxResult);
        }
    ], callback);
};


exports.cancelReturnInvoice = function (context, returnAuthorization, order, callback) {
    if (!order.avatax_get) {
        callback();
        return;
    }

    async.waterfall([
        getClient.bind(this, context),

        function (avalaraClient, callback) {
            var avalaraConfig = context.config.avalara,
                cancelTaxRequestData = {
                    CompanyCode : avalaraConfig.companyCode || 'OGI',
                    DocType : 'ReturnInvoice',
                    DocCode : order.number + '.' + returnAuthorization.id
                },
                stat = statsdHelper.beginStat(context, 'avalara.cancel_tax');

            avalaraClient.taxService.cancelTax(cancelTaxRequestData, function (error, cancelTaxResult) {
                finishAvalaraRequestStat(stat, error, cancelTaxResult);

                if (error) {
                    callback(error);
                    return;
                }

                callback(null, cancelTaxResult);
            });
        },

        function (cancelTaxResult, callback) {
            if (cancelTaxResult.ResultCode !== 'Success') {
                var error = new Error('Failed to cancel return invoice. Cancel tax failed.');
                error.name = 'AvalaraError';
                error.data = cancelTaxResult;
                callback(error);
                return;
            }

            callback();
        }
    ], callback);
};
