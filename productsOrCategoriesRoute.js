
const express = require('express');
const { HTTPErrorCodes, SuccessResponse, FailureResponse, promiseCatchCallback, sendErrorResponseToClient } = require('./helpers.js');
const databaseClient = require('./databaseClient.js');
const { requireAuthentication } = require('./authentication');
const mime = require('mime-types');
const AWS = require('aws-sdk');
const getUUID = require('uuid/v4');


console.warn("TODO: write an sql function that checks that a new category parent id is not the child of the category, before actually updating the parent id. For now, I make 2 sql queries to do this, but what if an update happens in between the execution of those two queries? Fix it")

const AWS_S3_Helpers = {

    BUCKET_NAME: "screws-world-backend",
    PRODUCT_ITEM_IMAGE_FOLDER: "product-item-images",

    api: new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_KEY_ID,
    }),

    uploadProductItemImage: async (fileExtension, body) => {
        return new Promise((resolve, reject) => {
            const params = {
                Bucket: AWS_S3_Helpers.BUCKET_NAME,
                Key: AWS_S3_Helpers.PRODUCT_ITEM_IMAGE_FOLDER + "/" + getUUID() + fileExtension,
                Body: body,
            };
            AWS_S3_Helpers.api.upload(params, function (error, result) {
                error != null ? reject(error) : resolve(result);
            });
        });
    },

    deleteProductItemImage: async (fileKey) => {
        return new Promise((resolve, reject) => {
            const params = {
                Bucket: AWS_S3_Helpers.BUCKET_NAME,
                Key: fileKey,
            };
            AWS_S3_Helpers.api.deleteObject(params, function (error, result) {
                error != null ? reject(error) : resolve(result);
            });
        });
    },

    getAllProductItemImageKeys: async () => {
        return new Promise((resolve, reject) => {
            
            const params = {
                Prefix: AWS_S3_Helpers.PRODUCT_ITEM_IMAGE_FOLDER,
                Bucket: AWS_S3_Helpers.BUCKET_NAME,
            };

            AWS_S3_Helpers.api.listObjects(params, (error, data) => {
                if (data != null && data.Contents != null){
                    const keys = data.Contents.map(x => x.Key);
                    resolve(keys);
                } else {
                    reject(error == null ? new Error("An unknown error occured.") : error);
                }
            })
        })
    }
};









const categoryInfo = {
    name: "category",
    tableName: "product_categories",
}

const productInfo = {
    name: "product",
    tableName: "products",
}

// replaces the id string with a number if it is valid, sends an error and returns null if it isn't;
const validateIDMiddleware = function (request, response, next) {
    const id = Number(request.params.id);
    if (isNaN(id) === true) {
        response.status(HTTPErrorCodes.badRequest).json(FailureResponse(`The id, '${request.params.id}' is invalid.`));
        return;
    } else {
        request.params.id = id;
        next();
    }
}





function getRouterForCategoryOrProduct(categoryOrProductInfo) {

    const router = express.Router();

    function sendIdDoesNotExistFailure(request, response) {
        response.status(HTTPErrorCodes.resourceNotFound).json(FailureResponse(`No ${categoryOrProductInfo.name} exists with an id of ${request.params.id}.`));
    }



    router.use("/:id", validateIDMiddleware);

    // get all items

    const propertiesToFetch = "id, title, description, parent_category, image_url";

    router.get('/', (_, response) => {
        databaseClient.query(`select ${propertiesToFetch} from ${categoryOrProductInfo.tableName}`)
            .then(({ rows }) => {
                response.json(SuccessResponse(rows));
            }).catch(promiseCatchCallback(response));
    });


    // get item for id

    router.get('/:id', (request, response) => {
        const id = request.params.id;
        databaseClient.query(`select ${propertiesToFetch} from ${categoryOrProductInfo.tableName} where id = ${id}`)
            .then(({ rows: [firstRow] }) => {
                if (firstRow) {
                    response.json(SuccessResponse(firstRow));
                } else {
                    sendIdDoesNotExistFailure(request, response);
                }
            }).catch(promiseCatchCallback(response));
    });


    function grabProductItemPropsFromRequest(request) {
        const props = request.body;

        const getTrimmedValueForKey = (key) => {
            const trimmedValue = (() => {
                const untrimmedValue = props[key];
                if (typeof untrimmedValue === "string") {
                    return untrimmedValue.trim();
                } else { return untrimmedValue; }
            })();

            if (trimmedValue === "") {
                return null;
            } else {
                return trimmedValue
            }
        }

        return [
            { key: "title", value: getTrimmedValueForKey("title") },
            { key: "description", value: getTrimmedValueForKey("description") },
            { key: "parent_category", value: props.parent_category },
        ].filter(x => x.value !== undefined);
    }


    


    // create new item

    router.post('/', requireAuthentication, (request, response) => {

        const props = grabProductItemPropsFromRequest(request);

        const titleValueIsNotProvided = props.some(x => x.key === "title" && x.value != null) === false;

        if (titleValueIsNotProvided) {
            response.status(HTTPErrorCodes.badRequest)
                .json(FailureResponse("A value is required for the 'title' property, but you have not included it."));
            return;
        }

        const propNamesString = `(${props.map(x => x.key).join(", ")})`;
        const valuesString = `(${props.map((_, i) => "$" + (i + 1)).join(", ")})`;
        const values = props.map(x => x.value);

        databaseClient.query(`insert into ${categoryOrProductInfo.tableName} ${propNamesString} values ${valuesString} returning ${propertiesToFetch}`, values)
            .then(({ rows: [firstRow] }) => {
                response.json(SuccessResponse(firstRow));
            }).catch(promiseCatchCallback(response));
    });



    async function assertNewCategoryParentIsNotCurrentlyItsChild(categoryID, newParentCategoryID){
        const {rows: [firstRow]} = await databaseClient.query(`
        SELECT EXISTS (
            WITH RECURSIVE _all_ancestors AS (
                SELECT title, parent_category, id FROM product_categories WHERE id = $2 AND id != $1
                UNION ALL
                SELECT c.title, c.parent_category, c.id FROM _all_ancestors a 
                INNER JOIN 
                product_categories c ON (c.id = a.parent_category AND a.id != $1)
            )
            SELECT * FROM _all_ancestors WHERE id = $1
        )
        `, [categoryID, newParentCategoryID])

        if (firstRow.exists === true){
            return Promise.reject(new Error("You tried to set the parent of a category to be one of its children categories. This is not allowed."));
        } else {
            return undefined;
        }
    }


    // update already existing item

    router.put('/:id', requireAuthentication, (request, response) => {
        const id = request.params.id;
        const props = grabProductItemPropsFromRequest(request);

        if (props.length === 0) {
            response.status(HTTPErrorCodes.badRequest)
                .json(FailureResponse("You didn't send any valid properties to update the object with."))
            return;
        }

        const titleValueIsNull = props.some(x => x.key === "title" && x.value === null)

        if (titleValueIsNull) {
            response.status(HTTPErrorCodes.badRequest)
                .json(FailureResponse("The value you sent for the title property is invalid."))
            return;
        }

        const getDatabaseQueryPromise = () => {
            const values = props.map(x => x.value);
            const setPropsString = props.map((x, i) => `${x.key} = $${i + 1}`).join(", ");
            return databaseClient.query(`update ${categoryOrProductInfo.tableName} set ${setPropsString} where id = ${id} returning ${propertiesToFetch}`, values)
        };
        
        
        (async () => {
            if (categoryOrProductInfo === categoryInfo && 
                typeof props.parent_category === 'number' && 
                isNaN(props.parent_category) === false){
                
                await assertNewCategoryParentIsNotCurrentlyItsChild(id, props.parent_category);
                return await getDatabaseQueryPromise();
            } else {
                return getDatabaseQueryPromise();
            }
        })()
        .then(({rows: [affectedRow]}) => {
            if (affectedRow) {
                response.json(SuccessResponse(affectedRow));
            } else {
                sendIdDoesNotExistFailure(request, response);
            }
        })
        .catch(promiseCatchCallback(response));
    });


    // update item photo

    router.put('/:id/image', requireAuthentication, (request, response) => {

        if ((request.body instanceof Buffer) === false) {
            response.status(HTTPErrorCodes.badRequest)
                .json(FailureResponse("Either you have not included a body with the request or the body you have included is invalid."));
            return;
        }

        databaseClient.query(`select * from ${categoryOrProductInfo.tableName} where id = $1`, [request.params.id])
            .then(({ rows: [firstRow] }) => {

                if (firstRow == undefined) {
                    sendIdDoesNotExistFailure(request, response);
                    return;
                }

                const fileExtension = (() => {
                    let extension = mime.extension(request.headers["content-type"]);
                    if (extension === false) {
                        return "";
                    } else {
                        return "." + extension;
                    }
                })();

                const oldAWSImageKey = firstRow.image_aws_key

                AWS_S3_Helpers.uploadProductItemImage(fileExtension, request.body)
                    .then((result) => {
                        const url = result.Location;
                        const key = result.key;

                        const databaseQuery = databaseClient.query(`update ${categoryOrProductInfo.tableName} set image_aws_key = $1, image_url = $2 where id = $3 returning ${propertiesToFetch}`, [key, url, request.params.id]);

                        return Promise.all([databaseQuery, key]);

                    }).then(([dbResult, newAWSImageKey]) => {
                        const firstRow = dbResult.rows[0];

                        if (firstRow == undefined) {
                            sendIdDoesNotExistFailure(request, response);
                            deleteImageForPathAndIgnoreResponse(newAWSImageKey);
                            return;
                        }

                        deleteImageForPathAndIgnoreResponse(oldAWSImageKey);

                        response.json(SuccessResponse(firstRow));

                    }).catch(promiseCatchCallback(response));
            }).catch(promiseCatchCallback(response));
    });


    function deleteImageForPathAndIgnoreResponse(path) {
        AWS_S3_Helpers.deleteProductItemImage(path)
            .then(() => { /* dont care what happens here */ })
            .catch(() => { /* dont care what happens here */ });
    }


    // delete image

    router.delete('/:id/image', requireAuthentication, (request, response) => {
        databaseClient.query(`select * from ${categoryOrProductInfo.tableName} where id = $1`, [request.params.id])
            .then(({ rows: [firstRow] }) => {

                if (firstRow == undefined) {
                    sendIdDoesNotExistFailure(request, response);
                    return;
                }

                const oldImageKey = firstRow.image_aws_key;

                databaseClient.query(`update ${categoryOrProductInfo.tableName} set image_aws_key = null, image_url = null where id = $1 returning ${propertiesToFetch}`, [request.params.id])
                    .then(({ rows: [firstRow] }) => {
                        if (firstRow) {
                            deleteImageForPathAndIgnoreResponse(oldImageKey);
                            response.json(SuccessResponse(firstRow));
                        } else {
                            sendIdDoesNotExistFailure(request, response);
                        }
                    }).catch(promiseCatchCallback(response));

            }).catch(promiseCatchCallback(response));
    });






    // delete item

    router.delete('/:id', requireAuthentication, (request, response) => {

        const id = request.params.id;

        
        const imageKeysGetter = (() => {
            if (categoryOrProductInfo === categoryInfo){
                return getAllImageKeysForCategoryAndRecursiveChildren;
           } else {
                return async (id) => {
                    const result = await getImageKeyForProduct(id);

                    if (typeof result === "string"){
                        return [result];
                    } else {return []}
                }
            }
        })();
        
        imageKeysGetter(id)
            .then((imageKeys) => {
                const databaseQuery = databaseClient.query(`delete from ${categoryOrProductInfo.tableName} where id = ${id} returning *`);
                return Promise.all([imageKeys, databaseQuery]);
            })
            .then(([imagePaths, { rowCount }]) => {

                if (rowCount === 0) {
                    sendIdDoesNotExistFailure(request, response);
                } else {
                    response.json(SuccessResponse(null));
                    imagePaths.forEach(x => deleteImageForPathAndIgnoreResponse(x))
                }
            }).catch(promiseCatchCallback(response));
    });


    async function getImageKeyForProduct(productID){
        const {rows: [firstRow]} = await databaseClient.query(`select image_aws_key from products where id = $1`, [productID]);
        if (firstRow != null){
            return firstRow.image_aws_key;
        } else {
            return undefined;
        }
    }


    // returns an array containing the aws image key from the category with the category id provided, the children of that category, the children of the children and so on.

    async function getAllImageKeysForCategoryAndRecursiveChildren(categoryID) {
        const { rows } = await databaseClient.query(`
        WITH RECURSIVE all_descendents AS (

            SELECT id AS category_id, image_aws_key from product_categories where id = $1::integer
            
            UNION ALL

            (
                SELECT p.category_id, p.image_aws_key FROM
                
                (
                    SELECT id AS category_id, image_aws_key, parent_category FROM product_categories 
                    UNION ALL
                    SELECT NULL AS category_id, image_aws_key, parent_category FROM products
                ) p 
                
                INNER JOIN
                 
                all_descendents a
                
                ON p.parent_category = a.category_id
            )
        )

        SELECT * FROM all_descendents
        
        `, [categoryID]);
        return rows.map(x => x.image_aws_key).filter(x => x != null);
    }

    return router;
}


exports.getCategoriesRouter = () => getRouterForCategoryOrProduct(categoryInfo);
exports.getProductsRouter = () => getRouterForCategoryOrProduct(productInfo);











// call this function delete any unused images in aws

// function deleteUnusedS3Images(){
//     AWS_S3_Helpers.getAllProductItemImageKeys()
//     .then((allImageKeys) => {
//         const keysSQLString = allImageKeys.map(x => "('" + x + "')").join(", ");
//         return databaseClient.query(`
//         SELECT aws_values.image_aws_key FROM

//         (
//             SELECT image_aws_key, TRUE AS _is_from_db FROM product_categories 
//             UNION ALL
//             SELECT image_aws_key, TRUE AS _is_from_db FROM products
//         ) AS db_values

//         RIGHT OUTER JOIN 

//         (VALUES ${keysSQLString}) AS aws_values (image_aws_key)

//         ON db_values.image_aws_key = aws_values.image_aws_key

//         WHERE db_values._is_from_db IS NULL
//         `)
//     })
//     .then(({rows}) => {
//         const keysToDelete = rows.map(x => x.image_aws_key);
//         console.log("Here are the images in aws s3 that aren't being used by any database rows:")
//         console.log(keysToDelete);
//         console.log("If there are any, I'm going to delete them ^^ now");
//         const deletePromises = keysToDelete.map(x => AWS_S3_Helpers.deleteProductItemImage(x));
//         return Promise.all(deletePromises);
//     })
//     .then(() => {
//         console.log("I successfully deleted all unused aws s3 images, if there were any.");
//     })
//     .catch((error) => {
//         console.log(error);
//     })
// }


