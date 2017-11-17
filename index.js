exports.handler = (event, context, callback) => {

  if (event.keepalive) {
    callback(null,{"alive":true});
  } else {
    var AWS = require('aws-sdk');
    var s3 = new AWS.S3();
    var r53 = new AWS.Route53();

    var s3_content_bucket = process.env.S3_CONTENT_BUCKET;
    var s3_challenge_file = process.env.S3_CHALLENGE_PATH;

    var r53_zone = process.env.R53_ZONE_ID;
    var r53_hostname = process.env.R53_HOSTNAME;

    var request_challenge = null;
    var response_challenge = null;
    var challenge_psk = process.env.PSK;

    var ip_address = null;

    var request_response = null;

    var gen_next_challenge = function(){
      var char_array = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'];
      var next_challenge = '';
      var challenge_len = 48;
      var array_len = char_array.length;
      while(next_challenge.length != challenge_len) {
        next_challenge += char_array[(Math.floor(Math.random() * 100)%array_len)];
      }
      return next_challenge;
    };


    if (event.httpMethod == 'POST') {
      console.log(event);

      if ('system-user' in event.headers) {
        if (event.headers['system-user'] != process.env.AUTHORIZED_USER) {
          request_response = {
            statusCode: 401,
            headers: {'Content-type':'application/json'},
            body: JSON.stringify({'error':'Access Denied','reason':'Invalid Authentication'})
          };
          callback(null,request_response);
        }
      } else {
        request_response = {
          statusCode: 401,
          headers: {'Content-type':'application/json'},
          body: JSON.stringify({'error':'Access Denied','reason':'Invalid Authentication'})
        };
        callback(null,request_response);
      }
      if (event.body) {
          var body = JSON.parse(event.body);
          if (body.challenge) {
              request_challenge = body.challenge;
          } else {
            request_response = {
              statusCode: 401,
              headers: {'Content-type':'application/json'},
              body: JSON.stringify({'error':'Access Denied','reason':'Invalid Authentication'})
            };
            callback(null,request_response);
          }
          if (body.ip_address) {
            ip_address = body.ip_address;
          } else {
            request_response = {
              statusCode: 401,
              headers: {'Content-type':'application/json'},
              body: JSON.stringify({'error':'No IP Address Specified'})
            };
            callback(null,request_response);
          }
      }

      var s3_params = {
        Bucket: s3_content_bucket,
        Key: s3_challenge_file
      };
      s3.getObject(s3_params, function(err, data) {
        if (err) {
          request_response = {
            statusCode: 404,
            headers: {'Content-type':'application/json'},
            body: JSON.stringify({'error':err,'error_stack': err.stack})
          };
          callback(null,request_response);
        } else {
          json_data = JSON.parse(data.Body);
          if (json_data.challenge) {
            response_challenge = json_data.challenge;
          } else {
            request_response = {
              statusCode: 401,
              headers: {'Content-type':'application/json'},
              body: JSON.stringify({'error':'Invalid Function Configuration','specifics':"server challenge response missing"})
            };
            callback(null,request_response);
          }

          if (request_challenge == (response_challenge + '_' + challenge_psk)) {

            var r53_params = {
              ChangeBatch: {
                Changes: [{
                  Action: "UPSERT",
                  ResourceRecordSet: {
                    Name: r53_hostname,
                    ResourceRecords: [{Value: ip_address}],
                    TTL: 1800,
                    Type: "A"
                  }
                }],
                Comment: "Route53 DDNS Update"
              },
              HostedZoneId: r53_zone
            };
            r53.changeResourceRecordSets(r53_params, function(err, data) {
              if (err) {
                request_response = {
                  statusCode: 404,
                  headers: {'Content-type':'application/json'},
                  body: JSON.stringify({'error':err,'error_stack': err.stack})
                };
                callback(null,request_response);
              } else {
                var next_challenge = gen_next_challenge(); 
                var now = new Date();
                var s3_put_params = {
                  Body: JSON.stringify({'challenge': next_challenge,'last_updated': now }),
                  Bucket: s3_content_bucket,
                  Key: s3_challenge_file
                };
                var r53_data = data;
                s3.putObject( s3_put_params, function(err, data) {
                  if (err) {
                      console.log(JSON.stringify({'error':err,'error_stack': err.stack}));
                  } else {
                    request_response = {
                      isBase64Encoded: false,
                      statusCode: 200,
                      headers: {'Content-type': 'application/json'},
                      body: JSON.stringify(r53_data)
                    };
                    callback(null,request_response);
                  }
                });
              }
            });

          } else {
            request_response = {
              statusCode: 404,
              headers: {'Content-type':'application/json'},
              body: JSON.stringify({'error':err,'error_stack': err.stack})
            };
            callback(null,request_response);
          }
        }
      });
    } else {
      request_response = {
        statusCode: 401,
        headers: {'Content-type':'application/json'},
        body: JSON.stringify({'error':'Invalid Request Method','method':event.httpMethod})
      };
      callback(null,request_response);
    }
  }
};
