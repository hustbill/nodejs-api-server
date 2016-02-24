var u = require('underscore');

function setReporsOrganizationOrderInfo(result, orderInfo) {
    var orderArray,
        singleOrderInfoArray;

    result['qualification-volume'] = 0;
    result['dualteam-volume'] = 0;
    result['unilevel-volume'] = 0;
    result['fast-track-volume'] = 0;

    if ((orderInfo === '') || (orderInfo === null)) {
        result['order-count'] = 0;
        return;
    }

    orderArray = orderInfo.split(':');
    result['order-count'] = orderArray.length;

    orderArray.forEach(function (order) {
        singleOrderInfoArray = order.split(',');

        result['qualification-volume'] += parseFloat(singleOrderInfoArray[1]);
        result['dualteam-volume'] += parseFloat(singleOrderInfoArray[3]);
        result['unilevel-volume'] += parseFloat(singleOrderInfoArray[4]);
        result['fast-track-volume'] += parseFloat(singleOrderInfoArray[5]);
    });
    result['qualification-volume'] = result['qualification-volume'].toFixed(2);
    result['unilevel-volume'] = result['unilevel-volume'].toFixed(2);
    result['dualteam-volume'] = result['dualteam-volume'].toFixed(2);
}

function getAvatarUrl(str){
  if(u.isString(str) && str.length > 0){
      return '/upload/'+str;
  }
  return '/upload/avatar/nopic_mini.jpg';
}

function getSingResult(row) {
   var  hash,
        details = {},
        nextRankDetails = {};

     hash = {
       'distributor-id' : row.distributor_id,
       'email': row.email,
       'phone': row.phone || '',
       'avatar-url':  getAvatarUrl(row.avatar_url),
       'distributor-name': row.full_name,
       level: row.child_level,
       rank: row.rank_name,
       'role-code' : row.role_code,
       'country-iso': row.country_name,
       state: row.state_name,
       'dt-side': row.dt_side,
       'group-volume' : row.group_volume || 0,
       'personal-volume' : row.personal_volume || 0,
       'team-volume' : row.team_volume || 0,
       'direct-team-volume' : row.direct_team_volume || 0,
       'indirect-team-volume' : row.indirect_team_volume || 0,
       'personal-sales':row.personal_sales || 0,
       'details':{}
   };
   setReporsOrganizationOrderInfo(hash, row.order_info);

    //fill from detail
    if(u.isString(row.details)){
        try{
            details = JSON.parse(row.details);

            hash.details = details;

            if(u.isNumber(details['personal-sales'])){
                hash['personal-sales'] = details['personal-sales'].toFixed(2);
            }

            if(u.isNumber(details['qualification-volume'])){
                hash['qualification-volume'] = details['qualification-volume'].toFixed(2);
            }

            if(u.isNumber(details['personal-qualification-volume'])){
                hash['personal-volume'] = details['personal-qualification-volume'].toFixed(2);
            }
            if(u.isNumber(details['team-qualification-volume'])){
                hash['team-volume'] = details['team-qualification-volume'].toFixed(2);
            }
            if(u.isNumber(details['direct-team-qualification-volume'])){
                hash['direct-team-volume'] = details['direct-team-qualification-volume'].toFixed(2);
            }
            if(u.isNumber(details['indirect-team-qualification-volume'])){
                hash['indirect-team-volume'] = details['indirect-team-qualification-volume'].toFixed(2);
            }
            if(u.isNumber(details['group-qualification-volume'])){
                hash['group-volume'] = details['group-qualification-volume'].toFixed(2);
            }

            if(u.isObject(details['commission-volume']) && u.isNumber(details['commission-volume'].unilevel)){
                hash['unilevel-volume'] = details['commission-volume'].unilevel.toFixed(2);
            }
        }catch(e){

        }
    }

  
   return hash;
}

exports.getSingResult = getSingResult;