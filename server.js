/**
 * Organo Mobile Web Service, a.k.a Pulse
 */

// Constants
var CONFIG_LOCATION = './config.json';
var MIDDLEWARE_LOCATION = './middleware';
var HANDLERS_LOCATION = './handlers';
var MODELS_LOCATION = './models';

var DEFAULT_PORT = 8080;

var fs = require('fs');
var path = require('path');
var http = require('http');
var cluster = require('cluster');
var express = require('express');
var expressValidator = require('express-validator');
var bunyan = require('bunyan');
var Airbrake = require('airbrake');

var middleware,
    handlers,
    configFileLocation,
    config,
    rootLogger,
    airbrake,
    server;

try {
    // Load configuration, one time operation, so it's okay to be synchronise.
    /*jslint nomen: true*/

    configFileLocation = process.argv[2] || path.join(__dirname, CONFIG_LOCATION);
    console.log("Loading config from '" + configFileLocation + "'");
    /*jslint evil: true*/
    eval('config = ' + fs.readFileSync(configFileLocation));
    /*jslint evil: false*/

    // Create worker process root logger
    rootLogger = bunyan.createLogger({
        name : config.name,
        level : config.log.level,
        pid : process.pid,
        worker : cluster.worker && cluster.worker.id
    });

    // Redirect console logging methods to rootLogger
    console.error = rootLogger.error.bind(rootLogger);
    console.warn = rootLogger.warn.bind(rootLogger);
    console.info = rootLogger.info.bind(rootLogger);
    console.log = rootLogger.debug.bind(rootLogger);
    console.trace = rootLogger.trace.bind(rootLogger);

    rootLogger.info('Starting server worker process.');

    // Load all customized middleware and handlers;
    middleware = require(MIDDLEWARE_LOCATION);
    handlers = require(HANDLERS_LOCATION);

    server = express();

    // Set up airbrake
    airbrake = Airbrake.createClient(config.airbrake.apiKey);
    airbrake.env = process.env.NODE_ENV || 'development';
    airbrake.appVersion = require('./package').version;

    if (!config.airbrake.disabled) {
        process.on('uncaughtException', function (err) {
            rootLogger.error("UncaughtException: ", {
                message : err.message,
                stack : err.stack
            });
            airbrake.notify(err, function () {
                process.exit(1);
            });
        });
    }

    server.enable('trust proxy');

    // Set up the middleware stack
    server.use(express.limit('5mb'));
    server.use(middleware.contextCreator({
        config : config,
        airbrake : airbrake
    }));
    server.use(middleware.logger(rootLogger));
    server.use(middleware.statsdClient());
    server.use(middleware.timeoutChanger);
    server.use(middleware.sequelizer(
        path.join(__dirname, MODELS_LOCATION),
        config,
        rootLogger
    ));
    server.use(express.cookieParser());
    server.use(express.bodyParser());
    server.use(expressValidator);
    server.use(server.router);
    server.use(middleware.airbrakeNotifier.notifyTo(airbrake));
    server.use(middleware.responder);


    // Set up v2 Admin routes
    server.post(
        '/v2/admin/authentications/token',
        middleware.apiRequestStat('v2.admin_authentication_retrieve_token'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        handlers.v2.admin.authentication.token.post
    );

    server.post(
        '/v2/admin/autoships',
        middleware.apiRequestStat('v2.admin_create_autoship'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.autoship.post
    );

    server.post(
        '/v2/admin/autoships/adjustments',
        middleware.apiRequestStat('v2.admin_create_autoship_adjustments'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.autoship.adjustments.post
    );

    server.post(
        '/v2/admin/autoships/adjustments/:id',
        middleware.apiRequestStat('v2.admin_edit_autoship_adjustments'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.autoship.adjustments.update
    );

    server.get(
        '/v2/admin/autoships/products',
        middleware.apiRequestStat('v2.get_autoship_products'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.autoship.product.list
    );

    server.get(
        '/v2/admin/autoships/payment-methods',
        middleware.apiRequestStat('v2.get_autoship_payment_methods'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.autoship.paymentMethod.list
    );

    server.get(
        '/v2/admin/autoships/shipping-methods',
        middleware.apiRequestStat('v2.get_autoship_shipping_methods'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.autoship.shippingMethod.list
    );

    server.get(
        '/v2/orders/personal-sponsored',
        middleware.apiRequestStat('v2.view_personal_sponsored'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.order.personalSponsored.get
    );

    server.post(
        '/v2/admin/autoships/orders/summary',
        middleware.apiRequestStat('v2.admin_get_autoship_order_summary'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.autoship.order.summary.post
    );

    server.get(
        '/v2/admin/autoships/:autoshipId',
        middleware.apiRequestStat('v2.admin_get_autoship_detail'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.autoship.get
    );

    server.post(
        '/v2/admin/autoships/:autoshipId',
        middleware.apiRequestStat('v2.admin_update_autoship'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.autoship.update
    );

    server.del(
        '/v2/admin/autoships/:autoshipId',
        middleware.apiRequestStat('v2.admin_cancel_autoship'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.autoship.del
    );

    server.post(
        '/v2/admin/autoships/:autoshipId/orders',
        middleware.apiRequestStat('v2.admin_create_autoship_order'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.autoship.order.post
    );

    server.post(
        '/v2/admin/autoship-runs',
        middleware.apiRequestStat('v2.admin_run_autoships'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.autoshipRun.post
    );

    server.get(
        '/v2/admin/countries',
        middleware.apiRequestStat('v2.admin_list_countries'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.countries.list
    );

    server.get(
        '/v2/admin/countries/shipping',
        middleware.apiRequestStat('v2.admin_list_countries_shipping'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.countries.shipping.list
    );

    server.post(
        '/v2/admin/coupon',
        middleware.apiRequestStat('v2.admin_create_coupon'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.coupon.post
    );

    server.post(
        '/v2/admin/coupons/emails',
        middleware.apiRequestStat('v2.admin_create_coupon'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.coupon.email.post
    );

    server.post(
        '/v2/admin/genealogy/dualteam/placements',
        middleware.apiRequestStat('v2.admin_change_dualteam_placement'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.genealogy.dualteam.placement.post
    );

    server.post(
        '/v2/admin/orders',
        middleware.apiRequestStat('v2.admin_create_order'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.post
    );

    server.post(
        '/v2/admin/orders/checkout',
        middleware.apiRequestStat('v2.admin_checkout_order'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.checkout.post
    );

    server.get(
        '/v2/admin/orders/:orderId',
        middleware.apiRequestStat('v2.admin_get_order_detail'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.get
    );

    server.post(
        '/v2/admin/orders/:orderId/shipping',
        middleware.apiRequestStat('v2.admin_change_order_shipping'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.shipping.post
    );

    server.post(
        '/v2/admin/orders/:orderId/addresses/billing',
        middleware.apiRequestStat('v2.admin_change_order_billing_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.addresses.billing.post
    );

    server.post(
        '/v2/admin/orders/:orderId/cancel',
        middleware.apiRequestStat('v2.admin_cancel_order'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.cancel.post
    );

    server.post(
        '/v2/admin/orders/:orderId/adjustments',
        middleware.apiRequestStat('v2.admin_change_order_adjustments'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.adjustment.post
    );

    server.get(
        '/v2/admin/orders/:orderId/line-items',
        middleware.apiRequestStat('v2.admin_get_order_line_items'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.lineItem.list
    );

    server.post(
        '/v2/admin/orders/:orderId/line-items',
        middleware.apiRequestStat('v2.admin_change_order_line_items'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.lineItem.post
    );

    server.post(
        '/v2/admin/orders/:orderId/payments',
        middleware.apiRequestStat('v2.admin_pay_order'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.payments.post
    );

    server.post(
        '/v2/admin/orders/:orderId/payments/:paymentId/captures',
        middleware.apiRequestStat('v2.admin_capture_payment'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.payments.capture.post
    );

    server.post(
        '/v2/admin/orders/:orderId/refunds',
        middleware.apiRequestStat('v2.admin_refund_order'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.refund.post
    );

    server.get(
        '/v2/admin/orders/:orderId/return-authorizations',
        middleware.apiRequestStat('v2.admin_get_return_authorizations_of_order'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.returnAuthorization.list
    );

    server.post(
        '/v2/admin/orders/:orderId/return-authorizations',
        middleware.apiRequestStat('v2.admin_create_return_authorization'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.order.returnAuthorization.post
    );

    server.get(
        '/v2/admin/products',
        middleware.apiRequestStat('v2.admin_get_products'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.product.list
    );

    server.get(
        '/v2/admin/products/taxons/:taxonId',
        middleware.apiRequestStat('v2.admin_get_products_by_taxon'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.product.taxon.list
    );

    server.get(
        '/v2/admin/products/:productId',
        middleware.apiRequestStat('v2.admin_get_product_details'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.product.get
    );

    server.get(
        '/v2/admin/profile',
        middleware.apiRequestStat('v2.admin_profile'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.profile.get
    );

    server.post(
        '/v2/admin/return-authorizations/:returnAuthorizationId',
        middleware.apiRequestStat('v2.admin_update_return_authorization'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.returnAuthorization.post
    );

    server.post(
        '/v2/admin/return-authorizations/:returnAuthorizationId/cancel',
        middleware.apiRequestStat('v2.admin_cancel_return_authorization'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.returnAuthorization.cancel.post
    );

    server.post(
        '/v2/admin/return-authorizations/:returnAuthorizationId/receive',
        middleware.apiRequestStat('v2.admin_receive_return_authorization'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.returnAuthorization.receive.post
    );

    server.get(
        '/v2/admin/shipping-methods',
        middleware.apiRequestStat('v2.list_order_shipping_methods'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.shippingMethod.list
    );

    server.get(
        '/v2/admin/taxons',
        middleware.apiRequestStat('v2.admin_get_products'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.taxon.list
    );

    server.get(
        '/v2/admin/users/:userId/addresses',
        middleware.apiRequestStat('v2.admin_list_profile_addresses'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.address.list
    );

    server.post(
        '/v2/admin/users/:userId/addresses/home',
        middleware.apiRequestStat('v2.admin_change_home_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.address.home.post
    );

    server.post(
        '/v2/admin/users/:userId/addresses/billing',
        middleware.apiRequestStat('v2.admin_change_billing_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.address.billing.post
    );

    server.post(
        '/v2/admin/users/:userId/addresses/shipping',
        middleware.apiRequestStat('v2.admin_change_shipping_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.address.shipping.post
    );

    server.post(
        '/v2/admin/users/:userId/addresses/website',
        middleware.apiRequestStat('v2.admin_change_website_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.address.website.post
    );

    server.post(
        '/v2/admin/users/:userId/addresses/home/validate',
        middleware.apiRequestStat('v2.validate_home_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.address.home.validate
    );

    server.post(
        '/v2/admin/users/:userId/addresses/billing/validate',
        middleware.apiRequestStat('v2.validate_billing_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.address.billing.validate
    );

    server.post(
        '/v2/admin/users/:userId/addresses/shipping/validate',
        middleware.apiRequestStat('v2.validate_shipping_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.address.shipping.validate
    );

    server.post(
        '/v2/admin/users/:userId/addresses/website/validate',
        middleware.apiRequestStat('v2.validate_website_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.address.website.validate
    );
    server.get(
        '/v2/admin/users/terminate/:userId',
        middleware.apiRequestStat('v2.admin_terminate_user'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.terminate.get
    );

    server.post(
        '/v2/admin/users/:userId/token',
        middleware.apiRequestStat('v2.admin_retrieve_token_of_user'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.token.post
    );

    server.post(
        '/v2/admin/users/:userId/password',
        middleware.apiRequestStat('v2.admin_change_user_password'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.password.post
    );

    server.get(
        '/v2/admin/users/:userId/profile',
        middleware.apiRequestStat('v2.admin_get_user_profile'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.profile.get
    );

    server.post(
        '/v2/admin/users/:userId/profile',
        middleware.apiRequestStat('v2.admin_post_user_profile'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.profile.post
    );

    server.post(
        '/v2/admin/users/:userId/roles',
        middleware.apiRequestStat('v2.admin_post_user_role'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.roles.post
    );

    server.get(
        '/v2/admin/users/retail-role-change',
        middleware.apiRequestStat('v2.admin_get_user_retail_customers_change'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.user.retailCustomersChange.get
    );

    server.get(
        '/v2/admin/variants/:variantId',
        middleware.apiRequestStat('v2.admin_get_variant_detail'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.variant.get
    );

    server.get(
        '/v2/admin/commissions/inactive-users',
        middleware.apiRequestStat('v2.get_inactive_users'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.commission.inactiveUsers.get
    );

    server.get(
        '/v2/admin/commissions/next-month-cancelled-users',
        middleware.apiRequestStat('v2.get_admin_next_month_cancelled_users'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.commission.nextMonthCancelledUsers.get
    );

    server.get(
        '/v2/admin/commissions/career-rank-change-users',
        middleware.apiRequestStat('v2.career_rank_change_users'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.commission.careerRankChangeUsers.get
    );

    server.get(
        '/v2/admin/commissions/monthly',
        middleware.apiRequestStat('v2.list_admin_commissions_monthly'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.commission.monthly.list
    );

    server.get(
        '/v2/admin/commissions/monthly2',
        middleware.apiRequestStat('v2.list_admin_commissions_monthly2'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.commission.monthly.list2
    );

    server.get(
        '/v2/admin/commissions/monthly/:distributorId',
        middleware.apiRequestStat('v2.get_admin_commissions_monthly_distributor'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.commission.monthly.get
    );

    server.get(
        '/v2/admin/commissions/summaries',
        middleware.apiRequestStat('v2.list_admin_commissions_summary'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.commission.summary.list
    );

    server.get(
        '/v2/admin/commissions/summaries/users',
        middleware.apiRequestStat('v2.get_admin_commissions_summary_distributors'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.commission.summary.user.list
    );

    server.get(
        '/v2/admin/commissions/summaries/users/:distributorId',
        middleware.apiRequestStat('v2.get_admin_commissions_summary_distributor'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.commission.summary.user.get
    );

    server.get(
        '/v2/admin/commissions/ranks',
        middleware.apiRequestStat('v2.list_admin_commissions_ranks'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.commission.rank.list
    );

    server.get(
        '/v2/admin/commissions/ranks/:distributorId',
        middleware.apiRequestStat('v2.get_admin_commissions_ranks'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.commission.rank.get
    );

    // Set up V2 routes
    server.post(
        '/v2/Authentications/token',
        middleware.apiRequestStat('v2.authentication_retrieve_token'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        handlers.v2.authentication.token.post.retrieveToken
    );

    server.post(
        '/v2/authentications/reset-password',
        middleware.apiRequestStat('v2.authentication_reset_password'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('authentications'),
        handlers.v2.authentication.resetPassword.post
    );

    server.post(
        '/v2/authentications/reset-password-tokens',
        middleware.apiRequestStat('v2.authentication_create_reset_password_token'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('authentications'),
        handlers.v2.authentication.resetPasswordToken.post
    );

    server.post(
        '/v2/authentications/reset-password-tokens/emails',
        middleware.apiRequestStat('v2.authentication_email_reset_password_token'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('authentications'),
        handlers.v2.authentication.resetPasswordToken.email.post
    );

    server.get(
        '/v2/authentications/reset-password-tokens/validate',
        middleware.apiRequestStat('v2.authentication_validate_reset_password_token'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('authentications'),
        handlers.v2.authentication.resetPasswordToken.validate.get
    );

    server.post(
        '/v2/autoships',
        middleware.apiRequestStat('v2.create_autoship'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.autoship.post
    );

    server.get(
        '/v2/autoships/products',
        middleware.apiRequestStat('v2.get_autoship_products'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.autoship.product.list
    );

    server.get(
        '/v2/autoships/payment-methods',
        middleware.apiRequestStat('v2.get_autoship_payment_methods'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.autoship.paymentMethod.list
    );

    server.get(
        '/v2/autoships/shipping-methods',
        middleware.apiRequestStat('v2.get_autoship_shipping_methods'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.autoship.shippingMethod.list
    );

    server.post(
        '/v2/autoships/orders/summary',
        middleware.apiRequestStat('v2.get_autoship_order_summary'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.autoship.order.summary.post
    );

    server.get(
        '/v2/autoships/:autoshipId',
        middleware.apiRequestStat('v2.get_autoship_detail'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.autoship.get
    );

    server.post(
        '/v2/autoships/:autoshipId',
        middleware.apiRequestStat('v2.update_autoship'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.autoship.update
    );

    server.del(
        '/v2/autoships/:autoshipId',
        middleware.apiRequestStat('v2.cancel_autoship'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.autoship.del
    );

    server.get(
        '/v2/addresses',
        middleware.apiRequestStat('v2.list_profile_addresses'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.address.list
    );

    server.post(
        '/v2/addresses/home',
        middleware.apiRequestStat('v2.change_home_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.address.home.post
    );

    server.post(
        '/v2/addresses/billing',
        middleware.apiRequestStat('v2.change_billing_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.address.billing.post
    );

    server.post(
        '/v2/addresses/shipping',
        middleware.apiRequestStat('v2.change_shipping_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.address.shipping.post
    );

    server.post(
        '/v2/addresses/website',
        middleware.apiRequestStat('v2.change_website_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.address.website.post
    );

    server.post(
        '/v2/addresses/home/validate',
        middleware.apiRequestStat('v2.validate_home_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('validateAddress')
        ),
        handlers.v2.address.home.validate
    );

    server.post(
        '/v2/addresses/billing/validate',
        middleware.apiRequestStat('v2.validate_billing_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('validateAddress')
        ),
        handlers.v2.address.billing.validate
    );

    server.post(
        '/v2/addresses/shipping/validate',
        middleware.apiRequestStat('v2.validate_shipping_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('validateAddress')
        ),
        handlers.v2.address.shipping.validate
    );

    server.post(
        '/v2/addresses/website/validate',
        middleware.apiRequestStat('v2.validate_website_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('validateAddress')
        ),
        handlers.v2.address.website.validate
    );

    server.get(
        '/v2/autoships',
        middleware.apiRequestStat('v2.list_autoships'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.autoship.list
    );

    server.get(
        '/v2/autoships/details',
        middleware.apiRequestStat('v2.list_autoships_details'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.autoship.detail.list
    );

    server.get(
        '/v2/clients/versions',
        middleware.apiRequestStat('v2.get_clients_versions'),
        handlers.v2.client.version.get
    );

    server.get(
        '/v2/commissions/career-rank-change-users',
        middleware.apiRequestStat('v2.career_rank_change_users'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.commission.careerRankChangeUsers.get
    );

    server.get(
        '/v2/commissions/dates',
        middleware.apiRequestStat('v2.get_commissions_dates'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.commission.date.get
    );

    server.get(
        '/v2/commissions/inactive-users',
        middleware.apiRequestStat('v2.get_inactive_users'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.commission.inactiveUsers.get
    );

    server.get(
        '/v2/commissions/next-month-cancelled-users',
        middleware.apiRequestStat('v2.next_month_cancelled_users'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.commission.nextMonthCancelledUsers.get
    );

    server.get(
        '/v2/commissions/dualteam-views',
        middleware.apiRequestStat('v2.get_commissions_dualteam_view'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.commission.dualteamView.get
    );

    server.get(
        '/v2/commissions/monthly',
        middleware.apiRequestStat('v2.get_commissions_monthly'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.commission.monthly.get
    );

    server.get(
        '/v2/commissions/monthly/types',
        middleware.apiRequestStat('v2.get_commissions_monthly_unilevel_types'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.commission.monthly.types.list
    );


    server.get(
        '/v2/commissions/monthly/counts',
        middleware.apiRequestStat('v2.get_commissions_monthly_counts'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.commission.monthly.count.get
    );

    server.get(
        '/v2/commissions/ranks',
        middleware.apiRequestStat('v2.get_commissions_ranks'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.commission.rank.get
    );

    server.get(
        '/v2/commissions/monthly/summaries',
        middleware.apiRequestStat('v2.get_commissions_monthly_sumaries'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.commission.monthly.summary.get
    );

    server.get(
        '/v2/commissions/summaries/:distributorId',
        middleware.apiRequestStat('v2.get_commissions_sumaries_by_distributorId'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.commission.summary.get
    );

    server.get(
        '/v2/commissions/quarterly',
        middleware.apiRequestStat('v2.get_commissions_quarterly'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.commission.quarterly.get
    );

    server.get(
        '/v2/commissions/weekly',
        middleware.apiRequestStat('v2.get_commissions_weekly'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.commission.weekly.get
    );

    server.get(
        '/v2/countries',
        middleware.apiRequestStat('v2.list_countries'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.countries.list
    );

    server.get(
        '/v2/countries/shipping',
        middleware.apiRequestStat('v2.list_countries_shipping'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.countries.shipping.list
    );

    server.get(
        '/v2/countries/:countryISO/variant-availabilities',
        middleware.apiRequestStat('v2.list_variant_availabilities_in_country'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        handlers.v2.countries.variantAvailabilities.list
    );

    server.get(
        '/v2/coupons',
        middleware.apiRequestStat('v2.list_coupons_of_user'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.coupons.list
    );


    server.get(
        '/v2/dashboards/backoffices',
        middleware.apiRequestStat('v2.get_dashboard_backoffice'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.dashboard.backoffice.get
    );

    server.get(
        '/v2/dashboards/enrollments/customers',
        middleware.apiRequestStat('v2.get_dashboard_enrollments-customers'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.dashboard.enrollment.customer.get
    );

    server.get(
        '/v2/dashboards/enrollments/distributors',
        middleware.apiRequestStat('v2.get_dashboard_enrollments-distributors'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.dashboard.enrollment.distributor.get
    );

    server.get(
        '/v2/dashboards/orders/count',
        middleware.apiRequestStat('v2.get_dashboard_order-count'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.dashboard.order.count.get
    );

    server.get(
        '/v2/dashboards/orders/recent',
        middleware.apiRequestStat('v2.get_dashboard_order-recent'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.dashboard.order.recent.get
    );

    server.get(
        '/v2/dashboards/active-distributors/count',
        middleware.apiRequestStat('v2.get_dashboard_active-distributors-count'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.dashboard.activeDistributor.count.get
    );

    server.get(
        '/v2/dashboards/commissions',
        middleware.apiRequestStat('v2.get_dashboard_commissions'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.dashboard.commission.get
    );
    server.get(
        '/v2/dashboards/three-month-pv',
        middleware.apiRequestStat('v2.get_dashboard_three-month-pv'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.dashboard.threeMonthPv.get
    );


    server.get(
        '/v2/dashboards/downlines/count',
        middleware.apiRequestStat('v2.get_dashboard_downline_count'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.dashboard.downline.count.get
    );

    server.get(
        '/v2/dashboards/inactive',
        middleware.apiRequestStat('v2.list_dashboard_inactive'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.dashboard.inactive.list
    );

    server.get(
        '/v2/dashboards/monthly/sponsored/count',
        middleware.apiRequestStat('v2.list_dashboard_monthly-sponsored-count'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.dashboard.monthly.sponsored.count.get
    );


    server.get(
        '/v2/distributors',
        middleware.apiRequestStat('v2.search_distributors'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        handlers.v2.distributor.list
    );

    server.get(
        '/v2/events/:eventCode/orders',
        middleware.apiRequestStat('v2.get_orders_of_event'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.event.order.list
    );

    server.get(
        '/v2/genealogy/dualteam',
        middleware.apiRequestStat('v2.get_genealogy_dualteam'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.genealogy.dualteam.get
    );

    server.get(
        '/v2/genealogy/dualteam/extreme-bottom',
        middleware.apiRequestStat('v2.get_genealogy_dualteam_extreme_bottom'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.genealogy.dualteam.extremeBottom.get
    );

    server.get(
        '/v2/genealogy/dualteam/path',
        middleware.apiRequestStat('v2.get_genealogy_dualteam_path'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.genealogy.dualteam.path.get
    );

    server.get(
        '/v2/genealogy/unilevel',
        middleware.apiRequestStat('v2.get_genealogy_unilevel'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.genealogy.unilevel.get
    );

    server.get(
        '/v2/genealogy/unilevel/path',
        middleware.apiRequestStat('v2.get_genealogy_unilevel_path'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.genealogy.unilevel.path.get
    );

    server.get(
        '/v2/genealogy/forced-matrix',
        middleware.apiRequestStat('v2.get_genealogy_forced-matrix'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.genealogy.forcedMatrix.get
    );

     server.get(
        '/v2/genealogy/forced-matrix/path',
        middleware.apiRequestStat('v2.get_genealogy_forced-matrix_path'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.genealogy.forcedMatrix.path.get
    );


    server.post(
        '/v2/giftcard-orders/:orderId/payments',
        middleware.apiRequestStat('v2.purchase_gift_card_with_order_id'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        handlers.v2.giftCardOrder.payment.post
    );

    server.get(
        '/v2/giftcards',
        middleware.apiRequestStat('v2.get_gift_cards_bought_by_user'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('giftCard'),
        middleware.authenticator,
        handlers.v2.giftCard.list
    );

    server.get(
        '/v2/giftcards/:giftCardCode',
        middleware.apiRequestStat('v2.get_gift_card_detail'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.apiPermissionValidator('giftCard'),
        handlers.v2.giftCard.get
    );

    server.post(
        '/v2/giftcards/:giftCardCode/emails',
        middleware.apiRequestStat('v2.send_gift_card_email'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.apiPermissionValidator('giftCard'),
        handlers.v2.giftCard.email.post
    );

    server.post(
        '/v2/giftcards',
        middleware.apiRequestStat('v2.purchase_gift_card_without_order_id'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        handlers.v2.giftCard.post
    );

    server.get(
        '/v2/giftcards/designs',
        middleware.apiRequestStat('v2.get_gift_card_designs'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.apiPermissionValidator('giftCard'),
        handlers.v2.giftCard.design.list
    );

    // hyperwallet apis
    server.post(
        '/v2/hyperwallets/accounts',
        middleware.apiRequestStat('v2.create_hyperwallet_account'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.hyperwallet.account.post
    );

    server.get(
        '/v2/hyperwallets/accounts',
        middleware.apiRequestStat('v2.get_hyperwallet_account'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.hyperwallet.account.get
    );

    server.post(
        '/v2/hyperwallets/funds',
        middleware.apiRequestStat('v2.post_hyperwallet_fund'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.hyperwallet.fund.post
    );

    server.get(
        '/v2/hyperwallets/accounts/details',
        middleware.apiRequestStat('v2.get_hyperwallet_account_details'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.hyperwallet.account.detail.get
    );

    server.get(
        '/v2/hyperwallets/accounts/balances',
        middleware.apiRequestStat('v2.get_hyperwallet_account_balances'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.hyperwallet.account.balance.get
    );


    server.get(
        '/v2/localization',
        middleware.apiRequestStat('v2.get_localization'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        handlers.v2.localization.get
    );

    server.post(
        '/v2/logout',
        middleware.apiRequestStat('v2.post_logout'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.logout.post
    );

    server.get(
        '/v2/orders/recent',
        middleware.apiRequestStat('v2.get_orders_recent'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.order.recent.get
    );

    server.get(
        '/v2/orders',
        middleware.apiRequestStat('v2.list_orders'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.order.list
    );

    server.post(
        '/v2/orders',
        middleware.apiRequestStat('v2.create_order'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        handlers.v2.order.post
    );

    server.post(
        '/v2/orders/checkout',
        middleware.apiRequestStat('v2.checkout_order'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.order.checkout.post
    );

    server.get(
        '/v2/orders/shipping-methods',
        middleware.apiRequestStat('v2.list_order_shipping_methods'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.order.shippingMethod.list
    );

    server.get(
        '/v2/orders/payment-methods',
        middleware.apiRequestStat('v2.list_order_payment_methods'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.order.paymentMethod.list
    );

    server.get(
        '/v2/payment-methods',
        middleware.apiRequestStat('v2.list_order_payment_methods'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.paymentMethod.list
    );

    server.post(
        '/v2/orders/adjustments',
        middleware.apiRequestStat('v2.calculate_adjustments'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.order.adjustment.post
    );

    server.post(
        '/v2/orders/purchase-allowed',
        middleware.apiRequestStat('v2.post_order_purchase_allowed'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('orders')
        ),
        handlers.v2.order.purchaseAllowed.post
    );

    server.get(
        '/v2/orders/:idOrNum',
        middleware.apiRequestStat('v2.get_order_detail'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.order.get
    );

    server.get(
        '/v2/orders/:orderId/adjustments',
        middleware.apiRequestStat('v2.list_order_adjustments'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.order.adjustment.list
    );

    server.get(
        '/v2/orders/:orderId/line-items',
        middleware.apiRequestStat('v2.list_order_lineitems'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.order.lineItem.list
    );

    server.post(
        '/v2/orders/:orderId/shipping',
        middleware.apiRequestStat('v2.change_order_shipping'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.order.shipping.post
    );

    server.get(
        '/v2/orders/:orderId/addresses',
        middleware.apiRequestStat('v2.get_order_addresses'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.order.addresses.get
    );

    server.post(
        '/v2/orders/:orderId/addresses/billing',
        middleware.apiRequestStat('v2.change_order_billing_address'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.order.addresses.billing.post
    );

    server.post(
        '/v2/orders/:orderId/payments',
        middleware.apiRequestStat('v2.pay_order'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.authenticator,
        handlers.v2.order.payments.post
    );

    server.get(
        '/v2/products',
        middleware.apiRequestStat('v2.get_product_catalogs'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('products')
        ),
        handlers.v2.product.list
    );

    server.get(
        '/v2/products/taxons/:taxonId',
        middleware.apiRequestStat('v2.get_products_by_taxon'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('products')
        ),
        handlers.v2.product.taxon.list
    );

    server.get(
        '/v2/products/product-purchase-types',
        middleware.apiRequestStat('v2.list_product_purchase_types'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.product.productPurchaseType.list
    );

    server.get(
        '/v2/products/order-price-types',
        middleware.apiRequestStat('v2.list_order_price_types'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.product.orderPriceType.list
    );

    server.get(
        '/v2/products/:productId',
        middleware.apiRequestStat('v2.get_product_detail'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('products')
        ),
        handlers.v2.product.get
    );

    server.get(
        '/v2/profile',
        middleware.apiRequestStat('v2.get_profile'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.profile.get
    );

    server.post(
        '/v2/profile',
        middleware.apiRequestStat('v2.update_profile'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.profile.post
    );

    server.post(
        '/v2/profile/password',
        middleware.apiRequestStat('v2.change_user_password'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.profile.password.post
    );

    server.get(
        '/v2/profile/validate',
        middleware.apiRequestStat('v2.validate_profile'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.profile.validate.get
    );

    server.get(
        '/v2/ranks',
        middleware.apiRequestStat('v2.get_rank'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.rank.get
    );

    server.get(
        '/v2/reports/growth',
        middleware.apiRequestStat('v2.get_reports_growth'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.report.growth.get
    );

    server.get(
        '/v2/reports/orders',
        middleware.apiRequestStat('v2.get_reports_orders'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.report.order.list
    );

    server.get(
        '/v2/reports/orders/count',
        middleware.apiRequestStat('v2.get_reports_orders_count'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.report.order.count.get
    );

    server.get(
        '/v2/reports/organizations/counts/dualteam',
        middleware.apiRequestStat('v2.get_reports_organization_dualteam_count'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.report.organization.dualteam.count.get
    );

    server.get(
        '/v2/reports/organizations/counts/unilevel',
        middleware.apiRequestStat('v2.get_reports_organization_unilevel_count'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.report.organization.unilevel.count.get
    );

    server.get(
        '/v2/reports/organizations/dualteam',
        middleware.apiRequestStat('v2.get_reports_organization_dualteam'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.report.organization.dualteam.get
    );

    server.get(
        '/v2/reports/organizations/dualteam/:id',
        middleware.apiRequestStat('v2.get_reports_organization_dualteam_search'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.report.organization.dualteam.search.get
    );

    server.get(
        '/v2/reports/organizations/unilevel',
        middleware.apiRequestStat('v2.get_reports_organization_unilevel'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.report.organization.unilevel.get
    );

    server.get(
        '/v2/admin/reports/organizations/forced-matrix',
        middleware.apiRequestStat('v2.get_admin_reports_organization_forced-matrix'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.report.organization.forcedMatrix.get
    );

    server.get(
        '/v2/admin/reports/organizations/unilevel',
        middleware.apiRequestStat('v2.get_reports_organization_unilevel'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.report.organization.unilevel.get
    );

    server.get(
        '/v2/admin/reports/organizations/unilevel/search',
        middleware.apiRequestStat('v2.get_reports_organization_unilevel_search'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        middleware.adminPermissionValidator(),
        handlers.v2.admin.report.organization.unilevel.search
    );

    server.get(
        '/v2/reports/organizations/unilevel/:id',
        middleware.apiRequestStat('v2.get_reports_organization_unilevel_search'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.report.organization.unilevel.search
    );

    server.get(
        '/v2/reports/organizations/forced-matrix',
        middleware.apiRequestStat('v2.get_reports_organization_forced-matrix'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.report.organization.forcedMatrix.get
    );

    server.get(
        '/v2/reports/returns',
        middleware.apiRequestStat('v2.get_reports_return'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.report.return.get
    );

    server.get(
        '/v2/reports/signups',
        middleware.apiRequestStat('v2.get_reports_recent_signups'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.report.signup.list
    );

    server.get(
        '/v2/reports/summaries',
        middleware.apiRequestStat('v2.get_reports_summary'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.report.summary.get
    );

    server.get(
        '/v2/service-contacts',
        middleware.apiRequestStat('v2.get_service_contacts'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.serviceContact.get
    );

    server.post(
        '/v2/shopping-carts/users',
        middleware.apiRequestStat('v2.set_shopping_cart_of_user'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('shoppingCarts'),
        middleware.authenticator,
        handlers.v2.shoppingCart.user.post
    );

    server.post(
        '/v2/shopping-carts/visitors',
        middleware.apiRequestStat('v2.set_shopping_cart_of_visitor'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('shoppingCarts'),
        handlers.v2.shoppingCart.visitor.post
    );

    server.get(
        '/v2/shopping-carts/users',
        middleware.apiRequestStat('v2.get_shopping_cart_of_user'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('shoppingCarts'),
        middleware.authenticator,
        handlers.v2.shoppingCart.user.get
    );

    server.get(
        '/v2/shopping-carts/visitors/:visitorId',
        middleware.apiRequestStat('v2.get_shopping_cart_of_visitor'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('shoppingCarts'),
        handlers.v2.shoppingCart.visitor.get
    );

    server.del(
        '/v2/shopping-carts/users',
        middleware.apiRequestStat('v2.delete_shopping_cart_of_user'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('shoppingCarts'),
        middleware.authenticator,
        handlers.v2.shoppingCart.user.del
    );

    server.del(
        '/v2/shopping-carts/visitors/:visitorId',
        middleware.apiRequestStat('v2.delete_shopping_cart_of_visitor'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('shoppingCarts'),
        handlers.v2.shoppingCart.visitor.del
    );

    server.put(
        '/v2/shopping-carts/users/line-items',
        middleware.apiRequestStat('v2.set_shopping_cart_line_items_of_user'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('shoppingCarts'),
        middleware.authenticator,
        handlers.v2.shoppingCart.user.lineItem.put
    );

    server.post(
        '/v2/shopping-carts/users/line-items',
        middleware.apiRequestStat('v2.update_shopping_cart_line_items_of_user'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('shoppingCarts'),
        middleware.authenticator,
        handlers.v2.shoppingCart.user.lineItem.post
    );

    server.put(
        '/v2/shopping-carts/visitors/:visitorId/line-items',
        middleware.apiRequestStat('v2.set_shopping_cart_line_items_of_visitor'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('shoppingCarts'),
        handlers.v2.shoppingCart.visitor.lineItem.put
    );

    server.post(
        '/v2/shopping-carts/visitors/:visitorId/line-items',
        middleware.apiRequestStat('v2.update_shopping_cart_line_items_of_visitor'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.apiPermissionValidator('shoppingCarts'),
        handlers.v2.shoppingCart.visitor.lineItem.post
    );

    server.get(
        '/v2/signups/recent',
        middleware.apiRequestStat('v2.get_signups_recent'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.signup.recent.get
    );

    server.get(
        '/v2/system-preferences',
        middleware.apiRequestStat('v2.get_system_preferences'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        handlers.v2.systemPreference.list
    );

    server.get(
        '/v2/sponsor',
        middleware.apiRequestStat('v2.get_sponsor'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.sponsor.get
    );

    server.get(
        '/v2/taxons',
        middleware.apiRequestStat('v2.get_taxons'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('products')
        ),
        handlers.v2.taxon.list
    );

    server.get(
        '/v2/variants',
        middleware.apiRequestStat('v2.get_variant_detail'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('products')
        ),
        handlers.v2.variant.list
    );

    server.get(
        '/v2/variants/:variantId',
        middleware.apiRequestStat('v2.get_variant_detail'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('products')
        ),
        handlers.v2.variant.get
    );

    server.put(
        '/v2/profile/avatar',
        middleware.apiRequestStat('v2.change_profile_avatar'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.profile.avatar.put
    );

    server.post(
        '/v2/registrations',
        middleware.apiRequestStat('v2.post_registrations'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.post
    );

    server.post(
        '/v2/registrations/distributors-without-order',
        middleware.apiRequestStat('v2.post_distributor_registrations_without_order'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.distributorsWithoutOrder.post
    );

    server.post(
        '/v2/registrations/retail-customers',
        middleware.apiRequestStat('v2.post_retail_customer_registrations'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.retailCustomer.post
    );

    server.get(
        '/v2/registrations/validations/dualteam-sponsor-placement',
        middleware.apiRequestStat('v2.post_registrations'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.validation.dualteamSponsorPlacement.get
    );
    server.get(
        '/v2/registrations/validations/forced-matrix',
        middleware.apiRequestStat('v2.post_registrations'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.redisConnector,
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.validation.forcedMatrix.get
    );

    server.get(
        '/v2/registrations/countries',
        middleware.apiRequestStat('v2.get_registrations_countries'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.countries.list
    );

    server.get(
        '/v2/registrations/countries/shipping',
        middleware.apiRequestStat('v2.get_registrations_countries_shipping'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.countries.shipping.list
    );

    server.get(
        '/v2/registrations/sponsors/:distributorIdOrLogin',
        middleware.apiRequestStat('v2.get_registrations_sponsor'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.sponsor.get
    );

    server.get(
        '/v2/registrations/availabilities',
        middleware.apiRequestStat('v2.get_registrations_availability'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.availabilities.get
    );

    server.get(
        '/v2/registrations/license-agreements',
        middleware.apiRequestStat('v2.get_registrations_license_agreement'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.licenseAgreement.get
    );

    server.get(
        '/v2/registrations/products',
        middleware.apiRequestStat('v2.get_registrations_product_catalog'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.product.list
    );

    server.get(
        '/v2/registrations/orders/purchase-amount-limit',
        middleware.apiRequestStat('v2.get_registrations_order_purchase_amount_limit'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.order.purchaseAmountLimit.get
    );

    server.get(
        '/v2/registrations/orders/payment-methods',
        middleware.apiRequestStat('v2.get_registrations_order_payment_methods'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.order.paymentMethod.list
    );

    server.get(
        '/v2/registrations/orders/shipping-methods',
        middleware.apiRequestStat('v2.get_registrations_order_shipping_methods'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.order.shippingMethod.list
    );

    server.post(
        '/v2/registrations/orders/summary',
        middleware.apiRequestStat('v2.get_registrations_order_summary'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.order.summary.post
    );

    server.post(
        '/v2/registrations/orders/adjustments',
        middleware.apiRequestStat('v2.get_registrations_order_adjustments'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.order.adjustment.list
    );

    server.post(
        '/v2/registrations/purchase-allowed',
        middleware.apiRequestStat('v2.post_registrations_purchase_allowed'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.registrations.purchaseAllowed.post
    );

    server.post(
        '/v2/registrations/upgrade-to-distributor',
        middleware.apiRequestStat('v2.upgrade_to_distributor'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.memcachedConnector,
        middleware.redisConnector,
        middleware.authenticator,
        handlers.v2.registrations.upgradeToDistributor.post
    );

    server.get(
        '/v2/shopping-service-status',
        middleware.apiRequestStat('v2.get_service_status_shopping'),
        handlers.v2.shoppingServiceStatus.get
    );

    server.get(
        '/v2/shopping-dashboard',
        middleware.apiRequestStat('v2.get_shopping_dashboard'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('registrations')
        ),
        handlers.v2.shopping.get
    );

    server.get(
        '/v2/users/profile',
        middleware.apiRequestStat('v2.get_user_profile'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        handlers.v2.user.profile.get
    );

    server.get(
        '/v2/users/downlines/contacts',
        middleware.apiRequestStat('v2.list_user_downline_contacts'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.user.downlines.contacts.list
    );

    // external services
    server.get(
        '/external/v2/orders/current',
        middleware.apiRequestStat('v2.external_get_current_paid_orders'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.apiPermissionValidator('externalService'),
        handlers.v2.order.current.get
    );

    server.get(
        '/external/v2/orders/batches/:batchId',
        middleware.apiRequestStat('v2.external_get_paid_orders_by_batch_id'),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.apiPermissionValidator('externalService'),
        handlers.v2.order.batch.get
    );

    server.get(
        '/external/v2/giftcards/:giftCardCode',
        middleware.apiRequestStat('v2.get_gift_card_detail'),
    //  middleware.ipFilter(config.ipRules.all),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.apiPermissionValidator('externalService'),
        handlers.v2.giftCard.get
    );

    server.post(
        '/external/v2/giftcards/:giftCardCode/payments',
        middleware.apiRequestStat('v2.externalService'),
    //        middleware.ipFilter(config.ipRules.all),
        middleware.memcachedConnector,
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.apiPermissionValidator('externalService'),
        handlers.v2.giftCard.payment.post
    );

    server.get(
        '/v2/customers/orders',
        middleware.apiRequestStat('v2.list_customers_orders'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.customer.order.list
    );

    server.get(
        '/v2/customers',
        middleware.apiRequestStat('v2.list_customers'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.customer.list
    );

    server.post(
        '/v2/social-settings',
        middleware.apiRequestStat('v2.add_social_settings'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.socialSetting.validation,
        handlers.v2.socialSetting.post
    );
    server.put(
        '/v2/social-settings',
        middleware.apiRequestStat('v2.update_social_settings'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.authenticator,
        handlers.v2.socialSetting.validation,
        handlers.v2.socialSetting.put
    );
    server.get(
        '/v2/social-settings',
        middleware.apiRequestStat('v2.get_social_settings'),
        middleware.databaseConnector(),
        middleware.databaseConnector('read'),
        middleware.combinator.or(
            middleware.authenticator,
            middleware.apiPermissionValidator('authentications')
        ),
        handlers.v2.socialSetting.get
    );

    server.param('orderId', function (req, res, next, val) {
        req.params.orderId = parseInt(val, 10);
        next();
    });




    server.get('/service-status', function (req, res) { res.send(200, 'ok'); });

    server.listen(config.port || DEFAULT_PORT);
} catch (error) {
    (rootLogger || console).error('Failed to start the server: %s', error.stack);
}

