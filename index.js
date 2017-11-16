exports.handler = (event, context, callback) => {

  if (event.keepalive) {
    callback(null,{"alive":true});
  } else {
    var AWS = require('aws-sdk');
    var s3 = new AWS.S3();
    var r53 = new AWS.Route53();

    var s3_content_bucket = process.env.S3_CONTENT_BUCKET;
    var s3_challenge_file = process.env.S3_CHALLENGE_PATH;


    if (event.httpMethod == 'POST') {
      var s3_params = {
        Bucket: s3_content_bucket,
        Key: s3_challenge_file
      };
      s3.getObject(s3_params, function(err, data) {
        var request_response = null;
        if (err) {
          request_response = {
            statusCode: 404,
            headers: {'Content-type':'application/json'},
            body: JSON.stringify({'error':err,'error_stack': err.stack})
          };
          callback(null,request_response);
        } else {
          request_response = {
            isBase64Encoded: false,
            statusCode: 200,
            headers: {'Content-type':data.ContentType,'Content-length':data.ContentLength},
            body: data.Body.toString()
          };
          callback(null,request_response);
        }
      });
    } else {
      var request_response = {
        statusCode: 401,
        headers: {'Content-type':'application/json'},
        body: JSON.stringify({'error':'Invalid Request Method','method':event.httpMethod})
      };
      callback(null,request_response);
    }
  }
};
