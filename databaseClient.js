

const { Client } = require('pg');

/*

database tables

create table common_product_item_columns (
    title text not null,
    description text,
    image_url text,
    image_aws_key text
)

create table product_category(
    id serial primary key,    
    parent_category int references product_category on delete cascade,
    constraint parent_cannot_be_self check (parent_category != id)
);


create table product (
    id serial primary key,
    parent_category int references product_category on delete cascade,
)

CREATE TABLE users(
    id serial PRIMARY key,
    username text NOT NULL unique,
    hashed_password text NOT NULL
)


*/


const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: true,
});


client.connect();

module.exports = client;
