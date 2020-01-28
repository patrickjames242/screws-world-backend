require('dotenv').config();
const express = require('express');
const { categoryInfo, productInfo, getRouterForCategoryOrProduct } = require('./productsOrCategoriesRoute.js');
const {handleLogInRoute} = require('./authentication.js');


const app = express();

app.use(express.json());

app.use('/login', handleLogInRoute);
app.use('/categories', getRouterForCategoryOrProduct(categoryInfo));
app.use('/products', getRouterForCategoryOrProduct(productInfo));

const port = process.env.PORT || 5000;

app.listen(port, () => console.log(`Server started on port ${port}`));





