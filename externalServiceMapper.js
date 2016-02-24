/**
 * Map database entries to external service api results
 */

function mapVariantOption(option) {
    return {
        type : option.type,
        value : option.name
    };
}

function mapVariantOptions(options) {
    if (!options) {
        return [];
    }

    return options.map(mapVariantOption);
}

function mapLineItem(lineItem) {
    return {
        uid : lineItem.sku,
        'variant-id' : lineItem.variant_id,
        price : lineItem.price,
        quantity : lineItem.quantity,
        options : mapVariantOptions(lineItem.variant.options)
    };
}

function mapLineItems(lineItems) {
    if (!lineItems) {
        return [];
    }

    return lineItems.map(mapLineItem);
}

function mapAdjustment(adjustment) {
    return {
        type : adjustment.label,
        amount : adjustment.amount
    };
}

function mapAdjustments(adjustments) {
    if (!adjustments) {
        return [];
    }

    return adjustments.map(mapAdjustment);
}

function mapShippingAddress(address) {
    return {
        'first-name': address.firstname,
        'middle-name': address.middleabbr,
        'last-name': address.lastname,
        street : address.address1,
        'street-cont' : address.address2,
        city : address.city,
        zip : address.zipcode,
        phone: address.phone,
        mobile: address.mobile_phone,
        state : address.state_name,
        'country-iso' : address.country && address.country.iso,
    };
}

function mapOrder(order) {
    return {
        'currency-code' : order.currency && order.currency.code,
        'order-number' : order.number,
        'order-total' : order.total,
        'line-item-total' : order.item_total,
        'adjustment-total' : order.adjustment_total,
        'line-items' : mapLineItems(order.lineItems),
        adjustments : mapAdjustments(order.adjustments),
        'shipping-method' : order.shippingMethod.name,
        'shipping-address' : mapShippingAddress(order.shippingAddress)
    };
}

function mapOrders(orders) {
    if (!orders) {
        return [];
    }

    return orders.map(mapOrder);
}

exports.orderBatch = function (orderBatch) {
    return {
        'export-batch-id' : orderBatch.id,
        'export-date' : orderBatch.end_date,
        orders : mapOrders(orderBatch.orders)
    };
}

