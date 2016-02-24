exports.computeRate = function (context, storedProcedureName, order, calculatorId, callback) {
    var logger = context.logger,
        sqlStmt = 'SELECT * FROM ' + storedProcedureName + '($1, $2)',
        sqlParams = [order.id, calculatorId],
        taxAmount;

    logger.debug("Computing rate: %s", storedProcedureName);
    logger.debug("SQL statement: %s", sqlStmt);
    logger.debug("Parameters: %s", sqlParams);
    context.databaseClient.query(sqlStmt, sqlParams, function (error, result) {
        if (error) {
            callback(error);
            return;
        }

        if (!result.rows || result.rows.length === 0) {
            callback(new Error('Failed to compute rate.'));
            return;
        }

        taxAmount = result.rows[0][storedProcedureName];
        taxAmount = Math.round(taxAmount * 100) / 100;

        callback(null, taxAmount);
    });
};

