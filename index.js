/**
 * Responds to any HTTP request.
 *
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */
/**
 * Responds to any HTTP request.
 *
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */

const crypto = require("crypto");
const querystring = require('querystring');
const agent = require('superagent');
const parser = require('xml2json');
const constantsMWS = require('./constants');

function hmacSHA256(method, domain, path, secret, params) {
    var hmac = crypto.createHmac("sha256", secret);
    hmac.update(method + "\n");
    hmac.update(domain + "\n");
    hmac.update(path + "\n");

    let qs = '';
    let keys = Object.keys(params).sort();
    for (let i = 0, len = keys.length; i < len; i++) {
        qs += keys[i] + "=" + querystring.escape(params[keys[i]]);
        if (i !== (len - 1)) {
            qs += "&";
        }
    }
    hmac.update(qs, 'utf8');
    return hmac.digest('base64');
}

async function getMWSResponse(url) {
    let responseBody = await agent.post(url)
        .then((response) => {
            if (response.status !== 200) {
                return "Error";
            }
            return JSON.parse(parser.toJson(response.text));
        });

    if (responseBody === "Error") {
        return responseBody;
    }
    const Products = responseBody.ListMatchingProductsResponse.ListMatchingProductsResult.Products;
    if (Products.length === 1) {
        return "No Products Found getMWS";
    }
    try {
        const ItemAttributes = Products.Product.AttributeSets["ns2:ItemAttributes"];
        const ItemImage = (ItemAttributes["ns2:SmallImage"]["ns2:URL"]).replace(/._(.*?)_/, '');
        return {
            'Title': ItemAttributes["ns2:Title"],
            'ItemDimensions': {
                'Height': ItemAttributes["ns2:ItemDimensions"]["ns2:Height"],
                'Length': ItemAttributes["ns2:ItemDimensions"]["ns2:Length"],
                'Width': ItemAttributes["ns2:ItemDimensions"]["ns2:Width"],
                'Weight': ItemAttributes["ns2:ItemDimensions"]["ns2:Weight"]
            },
            'PackageDimensions': {
                'Height': ItemAttributes["ns2:PackageDimensions"]["ns2:Height"],
                'Length': ItemAttributes["ns2:PackageDimensions"]["ns2:Length"],
                'Width': ItemAttributes["ns2:PackageDimensions"]["ns2:Width"],
                'Weight': ItemAttributes["ns2:PackageDimensions"]["ns2:Weight"]
            },
            'Image': ItemImage
        };
    } catch (e) {
        return "No Products Found try catch";
    }
}

//get the asin number from the submit request
function getAsinNumber(query) {
    //if amazon.com if in the string, the query is a url
    let foundAmazon = query.includes("amazon.com");
    //return foundAmazon;
    if (foundAmazon !== false) {
        //split into segments the url. Usually the asin number is after /dp/ or /gp/product/
        let splitedUrl = query.substring(foundAmazon).split("/");
        try {
            // loop the array to find dp or gp
            for (let i = 0; i < splitedUrl.length; i++) {
                if (splitedUrl[i] === "dp") {
                    //sometime asin is follow for some query params
                    let indexChar = splitedUrl[i + 1].indexOf("?");
                    //if it has params return only the asin number that
                    // is locate in the first position
                    if (indexChar !== -1) {
                        return splitedUrl[i + 1].substring(0, indexChar);
                    }
                    return splitedUrl[i + 1];
                }

                if (splitedUrl[i] === "gp") {
                    if (splitedUrl[i + 1] === "product") {
                        let indexChar = splitedUrl[i + 2].indexOf("?");
                        if (indexChar !== -1) {
                            return splitedUrl[i + 2].substring(0, indexChar);
                        }
                        return splitedUrl[i + 2];
                    }
                }
            }
        } catch (e) {
            // is there any issue return no found
            return "No Found ASIN";
        }
    }
    else {
        //if it is not an url return asin 
        return query
    }
    return "No Found ASIN"
}


exports.sunshipCalculator = async (req, res) => {
    const queryMWS = req.query.query || req.body.query || 'B072X2HHQ3';
    const asinMWS = getAsinNumber(queryMWS);
    if (asinMWS === "No Found ASIN") {
        res.status(200).send("No Products Found");
    }
    //get constants from constants.js file
    const client_secret = constantsMWS.ClientSecret;
    const urlMWS = "mws.amazonservices.com";
    const urlPath = "/Products/2011-10-01";

    const params = {
        "AWSAccessKeyId": constantsMWS.AWSAccessKeyId,
        "Action": "ListMatchingProducts",
        "MWSAuthToken": constantsMWS.MWSAuthToken,
        "MarketplaceId": constantsMWS.MarketplaceId_US,
        "SellerId": constantsMWS.SellerId,
        "SignatureMethod": "HmacSHA256",
        "SignatureVersion": "2",
        "Timestamp": (new Date()).toISOString(),
        "Version": "2011-10-01",
        "Query": asinMWS
    }

    const signatureHashed = hmacSHA256('POST', urlMWS, urlPath, client_secret, params);
    params.Signature = signatureHashed;

    const fullUrlRequest = `https://${urlMWS}${urlPath}?` + querystring.stringify(params);
    try {
        const awsResponse = await getMWSResponse(fullUrlRequest);
        res.status(200).send(awsResponse);
    }
    catch (e) {
        res.status(501).send(e.message);
    }
};