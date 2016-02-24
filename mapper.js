var utils = require('./lib/utils');

/**
 * Map database entries to api results
 */

exports.state = function (state) {
    if (!state) {
        return null;
    }

    return {
        id : state.id,
        name : state.name,
        abbr : state.abbr
    };
};

exports.states = function (states) {
    if (!states) {
        return null;
    }

    return states.map(this.state, this);
};

exports.country = function (country) {
    if (!country) {
        return null;
    }

    return {
        id : country.id,
        name : country.name,
        iso : country.iso,
        states : this.states(country.states),
        currency : this.currency(country.currency)
    };
};

exports.countries = function (countries) {
    if (!countries) {
        return null;
    }

    return countries.map(this.country, this);
};


exports.coupon = function (coupon) {
    if (!coupon) {
        return null;
    }

    return {
        id : coupon.id,
        active : coupon.active,
        code : coupon.code,
        description : coupon.description,
        'expired-at' : coupon.expired_at,
        'is-single-user' : coupon.is_single_user,
        'user-id' : coupon.user_id,
        name : coupon.name,
        type : coupon.type,
        'usage-count' : coupon.usage_count,
        rules : this.couponRules(coupon.rules)
    };
};

exports.coupons = function (coupons) {
    if (!coupons) {
        return null;
    }

    return coupons.map(this.coupon, this);
};


exports.couponRules = function (couponRules) {
    if (!couponRules) {
        return null;
    }

    if (typeof couponRules === 'string') {
        couponRules = JSON.parse(couponRules);
    }

    return {
        'allow-all-products' : couponRules.allow_all_products,
        'coupon-product-group-id' : couponRules.coupon_product_group_id,
        'coupon-product-group' : this.couponProductGroup(couponRules.couponProductGroup),
        'countries-allowed' : couponRules.countries_allowed,
        'roles-allowed' : couponRules.roles_allowed,
        'operation' : couponRules.operation,
        'operation-amount' : couponRules.operation_amount,
        'commissionable-percentage' : couponRules.commissionable_percentage,
        'total-units-allowed' : couponRules.total_units_allowed,
        'minimal-accumulated-order-total' : couponRules.minimal_accumulated_order_total,
        'maximal-accumulated-order-total' : couponRules.maximal_accumulated_order_total
    };
};


exports.couponProductGroup = function (couponProductGroup) {
    if (!couponProductGroup) {
        return null;
    }

    return {
        id : couponProductGroup.id,
        name : couponProductGroup.name,
        description : couponProductGroup.description,
        products : this.products(couponProductGroup.products)
    };
};


exports.currency = function (currency) {
    if (!currency) {
        return null;
    }

    return {
        "iso-code": currency.iso_code,
        "num_decimals": currency.num_decimals,
        "symbol": currency.symbol
    };
};


exports.billingAddress = function (address) {
    if (!address) {
        return null;
    }

    return {
        id: address.id,
        'first-name': address.firstname,
        m: address.middleabbr,
        'last-name': address.lastname,
        phone: address.phone,

        street : address.address1,
        'street-cont' : address.address2,
        city : address.city,
        zip : address.zipcode,
        state : address.state_name,
        'state-id' : address.state_id || undefined,
        country : address.country_name,
        'country-id' : address.country_id || undefined
    };
};


exports.shippingAddress = function (address) {
    if (!address) {
        return null;
    }

    return {
        id: address.id,
        'first-name': address.firstname,
        m: address.middleabbr,
        'last-name': address.lastname,
        phone: address.phone,

        street : address.address1,
        'street-cont' : address.address2,
        city : address.city,
        zip : address.zipcode,
        state : address.state_name,
        'state-id' : address.state_id || undefined,
        country : address.country_name,
        'country-id' : address.country_id || undefined
    };
};


exports.homeAddress = function (address) {
    if (!address) {
        return null;
    }

    return {
        id: address.id,
        'first-name': address.firstname,
        m: address.middleabbr,
        'last-name': address.lastname,
        phone: address.phone,

        street : address.address1,
        'street-cont' : address.address2,
        city : address.city,
        zip : address.zipcode,
        state : address.state_name,
        'state-id' : address.state_id || undefined,
        country : address.country_name,
        'country-id' : address.country_id || undefined
    };
};


exports.websiteAddress = function (address) {
    if (!address) {
        return null;
    }

    return {
        id: address.id,
        'first-name': address.firstname,
        m: address.middleabbr,
        'last-name': address.lastname,
        phone: address.phone,

        email : address.email,
        fax : address.fax,
        mobile : address.mobile_phone
    };
};

exports.shippingAddresses = function (shippingAddresses) {
    if (!shippingAddresses) {
        return null;
    }

    return shippingAddresses.map(this.shippingAddress, this);
};


exports.shippingMethod = function (shippingMethod) {
    if (!shippingMethod) {
        return null;
    }

    return {
        id : shippingMethod.id,
        name : shippingMethod.name,
        'shipping-address-changeable' : !!shippingMethod.shippingAddressChangeable,
        'shipping-addresses' : this.shippingAddresses(shippingMethod.shippingAddresses)
    };
};

exports.shippingMethods = function (shippingMethods) {
    if (!shippingMethods) {
        return null;
    }

    return shippingMethods.map(this.shippingMethod, this);
};


exports.paymentMethod = function (paymentMethod) {
    if (!paymentMethod) {
        return null;
    }

    return {
        id : paymentMethod.id,
        name : paymentMethod.name,
        "is-creditcard" : paymentMethod.is_creditcard
    };
};

exports.paymentMethods = function (paymentMethods) {
    if (!paymentMethods) {
        return null;
    }

    return paymentMethods.map(this.paymentMethod, this);
};


exports.lineItemPersonalizedValue = function (lineItemPersonalizedValue) {
    if (!lineItemPersonalizedValue) {
        return null;
    }

    return {
        "id" : lineItemPersonalizedValue.id,
        "name" : lineItemPersonalizedValue.name,
        "value" : lineItemPersonalizedValue.value
    };
};

exports.lineItemPersonalizedValues = function (lineItemPersonalizedValues) {
    if (!lineItemPersonalizedValues) {
        return null;
    }

    return lineItemPersonalizedValues.map(this.lineItemPersonalizedValue, this);
};


exports.lineItem = function (lineItem) {
    if (!lineItem) {
        return null;
    }

    var adj_qv = lineItem.adj_qv || 0,
        qualificationVolume = utils.roundVolume(lineItem.q_volume + adj_qv),
        adj_cv = lineItem.adj_cv || 0,
        commissionVolume = utils.roundVolume(lineItem.u_volume + adj_cv);

    qualificationVolume = qualificationVolume < 0 ? 0 : qualificationVolume;
    commissionVolume = commissionVolume < 0 ? 0 : commissionVolume;


    return {
        "catalog-code" : lineItem.catalog_code,
        "role-code" : lineItem.role_code,
        "variant-id" : lineItem.variant_id,
        "product-id" : lineItem.product_id,
        "product-name" : lineItem.product_name,
        "sku" : lineItem.sku,
        "quantity" : lineItem.quantity,
        "price" : lineItem.price,
        "image-url" : lineItem.images && lineItem.images[0],
        "qualifiction-volume" : qualificationVolume,
        "qualification-volume" : qualificationVolume,
        "commission-volume" : commissionVolume,
        "shipped-quantity" : lineItem.shippedQuantity,
        "returned-quantity" : lineItem.returnedQuantity,
        "personalized-values" : this.lineItemPersonalizedValues(lineItem.personalizedValues)
    };
};

exports.lineItems = function (lineItems) {
    if (!lineItems) {
        return null;
    }

    return lineItems.map(this.lineItem, this);
};


exports.adjustment = function (adjustment) {
    if (!adjustment) {
        return null;
    }

    return {
        "id" : adjustment.id,
        "amount" : adjustment.amount,
        "label" : adjustment.label
    };
};

exports.adjustments = function (adjustments) {
    if (!adjustments) {
        return null;
    }

    return adjustments.map(this.adjustment, this);
};


exports.payment = function (payment) {
    if (!payment) {
        return null;
    }

    return {
        "id" : payment.id,
        "amount" : payment.amount,
        "payment-method-id" : payment.payment_method_id,
        "type" : payment.source_type,
        "state" : payment.state
    };
};

exports.payments = function (payments) {
    if (!payments) {
        return null;
    }

    return payments.map(this.payment, this);
};


exports.shipment = function (shipment) {
    if (!shipment) {
        return null;
    }

    return {
        "id" : shipment.id,
        "address-id" : shipment.address_id,
        "shipping-method-id" : shipment.shipping_method_id,
        "amount" : shipment.amount,
        "number" : shipment.number,
        "state" : shipment.state
    };
};

exports.shipments = function (shipments) {
    if (!shipments) {
        return null;
    }

    return shipments.map(this.shipment, this);
};


exports.order = function (order) {
    if (!order) {
        return null;
    }

    return {
        "id" : order.id,
        "user-id" : order.user_id,
        "number" : order.number,
        "state" : order.state,
        "role-code": order.role_code,
        "payment-state" : order.payment_state,
        "shipment-state" : order.shipment_state,
        "special-instructions" : order.special_instructions,
        "order-date" : order.order_date,
        "payment-date" : order.completed_at,
        "item-total" : order.item_total,
        "adjustment-total" : order.adjustment_total,
        "total" : order.total,
        "payment-total" : order.payment_total,
        "line-items" : this.lineItems(order.lineItems),
        "adjustments" : this.adjustments(order.adjustments),
        "billing-address" : this.billingAddress(order.billingAddress),
        "shipping-address" : this.shippingAddress(order.shippingAddress),
        "shipping-address-changeable" : order.shippingAddressChangeable,
        "shipping-method-id" : order.shipping_method_id,
        "shipping-tracking-number" : order.trackings,
        "available-shipping-methods" : this.shippingMethods(order.availableShippingMethods),
        "available-payment-methods" : this.paymentMethods(order.availablePaymentMethods),
        "available-coupons" : this.coupons(order.availableCoupons),
        "coupons" : this.orderCoupons(order.coupons)
    };
};

exports.orders = function (orders) {
    if (!orders) {
        return null;
    }

    return orders.map(this.order, this);
};


exports.orderCoupon = function (orderCoupon) {
    if (!orderCoupon) {
        return null;
    }

    return {
        "code" : orderCoupon.code,
        "description" : orderCoupon.description,
        "line-items" : this.orderCouponLineItems(orderCoupon.lineItems),
        "additional-line-items" : this.lineItems(orderCoupon.additionalLineItems)
    };
};

exports.orderCoupons = function (orderCoupons) {
    if (!orderCoupons) {
        return null;
    }

    return orderCoupons.map(this.orderCoupon, this);
};


exports.orderCouponLineItem = function (orderCouponLineItem) {
    if (!orderCouponLineItem) {
        return null;
    }

    return {
        "catalog-code" : orderCouponLineItem.catalogCode,
        "variant-id" : orderCouponLineItem.variantId,
        quantity : orderCouponLineItem.quantity
    };
};

exports.orderCouponLineItems = function (orderCouponLineItems) {
    if (!orderCouponLineItems) {
        return null;
    }

    return orderCouponLineItems.map(this.orderCouponLineItem, this);
};


exports.orderResult = function (order) {
    if (!order) {
        return null;
    }

    return {
        "id" : order.id,
        "number" : order.number,
        "state" : order.state,
        "payment-state" : order.payment_state,
        "special-instructions" : order.special_instructions,
        "order-date" : order.order_date,
        "payment-date" : order.completed_at,
        "item-total" : order.item_total,
        "adjustment-total" : order.adjustment_total,
        "total" : order.total,
        "payment-total" : order.payment_total,
        "line-items" : this.lineItems(order.lineItems),
        "adjustments" : this.adjustments(order.adjustments)
    };
};


exports.autoshipOrderSummary = function (order) {
    if (!order) {
        return null;
    }

    return {
        "user-id" : order.user_id,
        "item-total" : order.item_total,
        "adjustment-total" : order.adjustment_total,
        "total" : order.total,
        "autoship-items" : this.lineItems(order.autoshipItems),
        "adjustments" : this.adjustments(order.adjustments),
        "billing-address" : this.billingAddress(order.billingAddress),
        "shipping-address" : this.shippingAddress(order.shippingAddress),
        "shipping-address-changeable" : order.shippingAddressChangeable,
        "shipping-method-id" : order.shipping_method_id,
        "available-shipping-methods" : this.shippingMethods(order.availableShippingMethods),
        "available-payment-methods" : this.paymentMethods(order.availablePaymentMethods)
    };
};


exports.autoshipAdjustment = function (autoshipAdjustment) {
    if (!autoshipAdjustment) {
        return null;
    }

    return {
        "id" : autoshipAdjustment.id,
        "active" : autoshipAdjustment.active,
        "amount" : autoshipAdjustment.amount,
        "label" : autoshipAdjustment.label
    };
};

exports.autoshipAdjustments = function (autoshipAdjustments) {
    if (!autoshipAdjustments) {
        return null;
    }

    return autoshipAdjustments.map(this.autoshipAdjustment, this);
};


exports.autoship = function (autoship) {
    if (!autoship) {
        return null;
    }

    return {
        "id" : autoship.id,
        "user-id" : autoship.user_id,
        "state" : autoship.state,
        "autoship-day" : autoship.active_date,
        "next-autoship-date" : autoship.next_autoship_date,
        "last-autoship-date" : autoship.last_autoship_date,
        "frequency-by-month" : autoship.frequency_by_month,
        "start-date" : autoship.start_date,
        "item-total" : autoship.item_total,
        "adjustment-total" : autoship.adjustment_total,
        "total" : autoship.total,
        "qualifiction-volume" : autoship.qualification_volume,
        "qualification-volume" : autoship.qualification_volume,
        "autoship-items" : this.lineItems(autoship.autoshipItems),
        "autoship-adjustments" : this.autoshipAdjustments(autoship.autoshipAdjustments),
        "adjustments" : this.adjustments(autoship.adjustments),
        "creditcard-last4-digits" : autoship.creditcardLastDigits,
        "billing-address" : this.billingAddress(autoship.billingAddress),
        "shipping-address" : this.shippingAddress(autoship.shippingAddress),
        "shipping-address-changeable" : autoship.shippingAddressChangeable,
        "shipping-method-id" : autoship.shipping_method_id,
        "available-shipping-methods" : this.shippingMethods(autoship.availableShippingMethods),
        "available-payment-methods" : this.paymentMethods(autoship.availablePaymentMethods)
    };
};

exports.autoships = function (autoships) {
    if (!autoships) {
        return null;
    }

    return autoships.map(this.autoship, this);
};


exports.product = function (product) {
    if (!product) {
        return null;
    }

    return {
        "id" : product.id,
        "taxon-id" : product.taxon_id,
        "name" : product.name,
        "description" : product.description,
        "sku" : product.sku,
        "price" : product.price,
        "suggested-price" : product.suggested_price,
        "images" : product.images,
        "thumbnail" : product.thumbnail || null,
        "position" : product.position,
        "variant-id" : product.variant_id,
        "variants" : this.variants(product.variants),
        "personalized-types" : this.productPersonalizedTypes(product.personalizedTypes),
        "properties" : product.properties || {},
        "catalog-code" : product.catalogCode,
        "deleted-at" : product.deleted_at,
        "distributor-only-membership": product.distributor_only_membership
    };
};

exports.products = function (products) {
    if (!products) {
        return null;
    }

    return products.map(this.product, this);
};


exports.variant = function (variant) {
    if (!variant) {
        return null;
    }

    return {
        "id" : variant.id,
        "product-id" : variant.product_id,
        "name" : variant.name,
        "description" : variant.description,
        "is-master" : variant.is_master,
        "count-on-hand" : variant.count_on_hand,
        "available-on" : variant.available_on,
        "sku" : variant.sku,
        "images" : variant.images,
        "price" : variant.price,
        "suggested-price" : variant.suggested_price,
        "prices" : this.variantPrices(variant.prices),
        "position" : variant.position,
        "commissions" : this.variantCommissions(variant.commissions),
        "options" : this.variantOptions(variant.options),
        "can-autoship" : variant.canAutoship,
        "deleted_at" : variant.deleted_at,
        "cost-price" : variant.cost_price
    };
};

exports.variants = function (variants) {
    if (!variants) {
        return null;
    }

    return variants.map(this.variant, this);
};


exports.variantPrice = function (variantPrice) {
    if (!variantPrice) {
        return null;
    }

    return {
        "role-code" : variantPrice.role_code,
        "role-name" : variantPrice.role_name,
        "price" : variantPrice.price,
        "suggested-price" : variantPrice.suggested_price
    };
};

exports.variantPrices = function (variantPrices) {
    if (!variantPrices) {
        return null;
    }

    return variantPrices.map(this.variantPrice, this);
};


exports.variantCommission = function (variantCommission) {
    if (!variantCommission) {
        return null;
    }

    return {
        "code" : variantCommission.code,
        "name" : variantCommission.name,
        "description" : variantCommission.description,
        "volume" : variantCommission.volume
    };
};

exports.variantCommissions = function (variantCommissions) {
    if (!variantCommissions) {
        return null;
    }

    return variantCommissions.map(this.variantCommission, this);
};


exports.variantOption = function (variantOption) {
    if (!variantOption) {
        return null;
    }

    return {
        "type" : variantOption.type,
        "name" : variantOption.name,
        "presentation-type" : variantOption.presentation_type,
        "presentation-value" : variantOption.presentation_value
    };
};

exports.variantOptions = function (variantOptions) {
    if (!variantOptions) {
        return null;
    }

    return variantOptions.map(this.variantOption, this);
};


exports.productPersonalizedType = function (productPersonalizedType) {
    if (!productPersonalizedType) {
        return null;
    }

    return {
        "id" : productPersonalizedType.id,
        "name" : productPersonalizedType.name,
        "required" : productPersonalizedType.required
    };
};

exports.productPersonalizedTypes = function (productPersonalizedTypes) {
    if (!productPersonalizedTypes) {
        return null;
    }

    return productPersonalizedTypes.map(this.productPersonalizedType, this);
};


exports.productPurchaseType = function (productPurchaseType) {
    if (!productPurchaseType) {
        return null;
    }

    return {
        "id" : productPurchaseType.id,
        "code" : productPurchaseType.code,
        "name" : productPurchaseType.name,
        "description" : productPurchaseType.description
    };
};

exports.productPurchaseTypes = function (productPurchaseTypes) {
    if (!productPurchaseTypes) {
        return null;
    }

    return productPurchaseTypes.map(this.productPurchaseType, this);
};


exports.orderPriceType = function (orderPriceType) {
    if (!orderPriceType) {
        return null;
    }

    return {
        "id" : orderPriceType.id,
        "code" : orderPriceType.code,
        "name" : orderPriceType.name,
        "description" : orderPriceType.description
    };
};

exports.orderPriceTypes = function (orderPriceTypes) {
    if (!orderPriceTypes) {
        return null;
    }

    return orderPriceTypes.map(this.orderPriceType, this);
};


exports.returnAuthorization = function (returnAuthorization) {
    if (!returnAuthorization) {
        return null;
    }

    return {
        "id" : returnAuthorization.id,
        "order-id" : returnAuthorization.order_id,
        "number" : returnAuthorization.number,
        "amount" : returnAuthorization.amount,
        "reason" : returnAuthorization.reason,
        "state" : returnAuthorization.state,
        "enter-at" : returnAuthorization.enter_at
    };
};

exports.returnAuthorizations = function (returnAuthorizations) {
    if (!returnAuthorizations) {
        return null;
    }

    return returnAuthorizations.map(this.returnAuthorization, this);
};


exports.taxon = function (taxon) {
    if (!taxon) {
        return null;
    }

    return {
        "id" : taxon.id,
        "taxonomy-id" : taxon.taxonomy_id,
        "parent-id" : taxon.parent_id,
        "position" : taxon.position,
        "name" : taxon.name,
        "permalink" : taxon.permalink,
        "lft" : taxon.lft,
        "rgt" : taxon.rgt,
        "image-url" : taxon.icon_file_name || '',
        "description" : taxon.description,
        "properties" : taxon.properties || {},
        "sub-taxons" : taxon.subTaxons && this.taxons(taxon.subTaxons)
    };
};

exports.taxons = function (taxons) {
    if (!taxons) {
        return null;
    }

    return taxons.map(this.taxon, this);
};


exports.parseHomeAddress = function (data) {
    if (!data) {
        return null;
    }

    return {
        // common
        id : data.id,
        firstname : data['first-name'],
        middleabbr : data.m,
        lastname : data['last-name'],
        phone : data.phone,

        // home
        joint_firstname : data['joint-first-name'],
        joint_middleabbr : data['joint-m'],
        joint_lastname : data['joint-last-name'],

        // billing / home / shipping
        address1 : data.street,
        address2 : data['street-cont'],
        city : data.city,
        zipcode : data.zip,
        state_id : parseInt(data['state-id'], 10) || 0,
        country_id : parseInt(data['country-id'], 10) || 0
    };
};

exports.parseBillingAddress = exports.parseShippingAddress = function (data) {
    if (!data) {
        return null;
    }

    return {
        // common
        id : data.id,
        firstname : data['first-name'],
        middleabbr : data.m,
        lastname : data['last-name'],
        phone : data.phone,

        // billing / home / shipping
        address1 : data.street,
        address2 : data['street-cont'],
        city : data.city,
        zipcode : data.zip,
        state_id : parseInt(data['state-id'], 10) || 0,
        country_id : parseInt(data['country-id'], 10) || 0
    };
};

exports.parseWebsiteAddress = function (data) {
    if (!data) {
        return null;
    }

    return {
        // common
        firstname : data['first-name'],
        middleabbr : data.m,
        lastname : data['last-name'],
        phone : data.phone,

        // website
        email : data.email,
        fax : data.fax,
        mobile_phone : data.mobile
    };
};

exports.parseCreditcard = function (data) {
    if (!data) {
        return null;
    }

    return {
        number : data.number,
        year : data['expiration-year'],
        month : data['expiration-month'],
        cvv : data.cvv
    };
};

exports.parseShoppingCartLineItem = function (data) {
    if (!data) {
        return null;
    }

    return {
        'variant-id' : parseInt(data['variant-id'], 10),
        quantity : parseInt(data.quantity, 10),
        'catalog-code' : data['catalog-code'],
        'role-code' : data['role-code'],
        'personalized-values' : data['personalized-values']
    };
};

exports.parseShoppingCartLineItems = function (data) {
    if (!data || !data.length) {
        return [];
    }

    return data.map(this.parseShoppingCartLineItem, this);
};


exports.parseLineItemPersonalizedValue = function (data) {
    if (!data) {
        return null;
    }

    return {
        id : parseInt(data.id, 10),
        value : data.value
    };
};

exports.parseLineItemPersonalizedValues = function (data) {
    if (!data) {
        return null;
    }

    return data.map(this.parseLineItemPersonalizedValue, this);
};


exports.parseLineItems = function (lineItems, defaultCatalogCode, defaultRoleCode) {
    var result = [],
        self = this;

    if (lineItems && lineItems.length) {
        lineItems.forEach(function (lineItem) {
            result.push({
                catalogCode : lineItem['catalog-code'] || defaultCatalogCode || 'SP',
                roleCode : lineItem['role-code'] || defaultRoleCode || 'D',
                variantId : parseInt(lineItem['variant-id'], 10),
                quantity : parseInt(lineItem.quantity, 10),
                personalizedValues : self.parseLineItemPersonalizedValues(lineItem['personalized-values'])
            });
        });
    }

    return result;
};

exports.parseShoppingCart = function (data) {
    if (!data) {
        return null;
    }

    return {
        id : data.id,
        'role-code' : data['role-code'],
        'line-items' : this.parseShoppingCartLineItems(data['line-items']),
        'optional-fields' : data['optional-fields']
    };
};


exports.giftCardDesign = function (giftCardDesign) {
    if (!giftCardDesign) {
        return null;
    }

    return {
        "id" : giftCardDesign.id,
        "small-image" : giftCardDesign.smallImage,
        "large-image" : giftCardDesign.largeImage
    };
};

exports.giftCardDesigns = function (giftCardDesigns) {
    if (!giftCardDesigns) {
        return null;
    }

    return giftCardDesigns.map(this.giftCardDesign, this);
};


exports.parseGiftCard = function (data) {
    if (!data) {
        return null;
    }

    return {
        code : data.code,
        pin : data.pin
    };
};


exports.parseCoupon = function (data) {
    if (!data) {
        return null;
    }

    return {
        id : parseInt(data.id, 10) || 0,
        active : !!data.active,
        code : data.code,
        description : data.description,
        expiredAt : data['expired-at'],
        isSingleUser : !!data['is-single-user'],
        userId : parseInt(data['user-id'], 10) || 0,
        name : data.name,
        usageCount : parseInt(data['usage-count'], 10) || 0,
        rules : this.parseCouponRules(data.rules)
    };
};


exports.parseCouponRules = function (data) {
    if (!data) {
        return null;
    }

    var rules = {
        allowAllProducts : !!data['allow-all-products'],
        couponProductGroupId : parseInt(data['coupon-product-group-id'], 10) || 0,
        operation : data.operation,
        operationAmount : parseFloat(data['operation-amount']) || 0,
        totalUnitsAllowed : parseInt(data['total-units-allowed'], 10) || 0,
        minimalAccumulatedOrderTotal : parseInt(data['minimal-accumulated-order-total'], 10) || 0,
        maximalAccumulatedOrderTotal : parseInt(data['maximal-accumulated-order-total'], 10) || 0
    };

    if (data.hasOwnProperty('commissionable-percentage')) {
        rules.commissionablePercentage = parseFloat(data['commissionable-percentage']);
        if (isNaN(rules.commissionablePercentage)) {
            rules.commissionablePercentage = null;
        }
    }

    return rules;
};


exports.parseOrderCoupon = function (data) {
    return {
        code : data.code,
        lineItems : this.parseOrderCouponLineItems(data['line-items']),
        additionalLineItems : this.parseLineItems(data['additional-line-items'])
    };
};


exports.parseOrderCoupons = function (data) {
    if (!data) {
        return null;
    }

    return data.map(this.parseOrderCoupon, this);
};


exports.parseOrderCouponLineItem = function (data) {
    return {
        variantId : parseInt(data['variant-id'], 10),
        quantity : parseInt(data.quantity, 10) || 0,
        catalogCode : data['catalog-code']
    };
};

exports.parseOrderCouponLineItems = function (data) {
    if (!data) {
        return null;
    }

    return data.map(this.parseOrderCouponLineItem, this);
};
