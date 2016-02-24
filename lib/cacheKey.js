exports.profile = function (distributorId) {
    return 'Profile_' + distributorId;
};


exports.productCatalog = function (distributorId) {
    return 'ProductCatalogs_' + distributorId;
};

exports.productCatalogByUserId = function (userId) {
    return 'ProductCatalogsByUserId_' + userId;
};

exports.productCatalogByCountryId = function (countryId) {
    return 'ProductCatalogsByCountryId_' + countryId;
};

exports.recentOrders = function (distributorId) {
    return 'RecentOrders_' + distributorId;
};

exports.productsByTaxonId = function (taxonId) {
    return 'ProductsByTaxonId_' + taxonId;
};

exports.productsByCountryIdAndTaxonId = function (countryId, taxonId) {
    return 'ProductsByCountryIdAndTaxonId_' + countryId + '_' + taxonId;
};

exports.productsByPacktypeId = function (countryId, packtypeId) {
    return 'ProductsByPacktypeId_' + packtypeId;
};

exports.lockOfRegistrationForLogin = function (login) {
    return 'LocksRegistrationForLogin_' + login;
};

exports.lockOfRegistrationForDualteam = function (sponsorId, placement) {
    return 'LocksRegistrationForDualteam_' + sponsorId + '_' + placement;
};

exports.lockOfRegistrationForForcedMatrix = function (forcedMatrix) {
    forcedMatrix = forcedMatrix || {};
    return 'LocksRegistrationForForcedMatrix_' + forcedMatrix.level + '_' + forcedMatrix.position;
};

exports.lockOfOrderByUserId = function (userId) {
    return 'LocksOrderByUserId_' + userId;
};

exports.shoppingCartByUserId = function (userId) {
    return 'ShoppingCartByUserId_' + userId;
};

exports.shoppingCartByVisitorId = function (visitorId) {
    return 'ShoppingCartByVisitorId_' + visitorId;
};

exports.productsOfCouponProductGroupForCountryAndRole = function (couponProductId, countryId, roleId) {
    return 'ProductsOfCouponProductGroupForCountryAndRole_' + couponProductId + '_' + countryId + '_' + roleId;
};

exports.sponsorInfoByDistributorId = function (distributorId) {
    return 'SponsorInfoByDistributorId_' + distributorId;
};

exports.sponsorNameAndEmailByDistributorId = function (distributorId) {
    return 'SponsorNameAndEmailByDistributorId_' + distributorId;
};

exports.monthlyCommission2Count = function(date, countryId){
    return 'monthly_commission2_count_'+date+'_'+countryId;
};
exports.monthlyCommission2Sum = function(date, countryId){
    return 'monthly_commission2_sum_'+date+'_'+countryId;
};
exports.monthlyCommission2LimitOffset = function(date, countryId, limit, offset){
    return 'monthly_commission2_data_'+date+'_'+countryId+'_'+limit+'_'+offset;
};
