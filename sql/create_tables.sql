drop table if exists mobile.oauth_tokens;
drop table if exists mobile.client_ids_secrets;
drop table if exists mobile.devices;

drop sequence if exists oauth_tokens_id_seq;
drop sequence if exists client_ids_secrets_id_seq;
drop sequence if exists devices_id_seq;

create table mobile.oauth_tokens(
    id serial primary key,
    hmac_key character varying(255) not null,
    distributor_id bigint not null,
    client_id character varying(255) not null,
    device_id character varying(255) not null,
    description character varying(255) not null,
    active boolean default true,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);

create table mobile.client_ids_secrets(
    id serial primary key,
    client_id character varying(255) not null,
    client_secret character varying(255) not null,
    description character varying(255) not null,
    active boolean default true,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);

create table mobile.devices(
    id serial primary key,
    distributor_id bigint not null,
    device_id character varying(255) not null,
    device_os character varying(12) not null,
    push_notification_token character varying(255) not null,
    description character varying(255) not null,
    active boolean default true,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);

INSERT INTO mobile.client_ids_secrets(client_id, client_secret, description, active, created_at, updated_at) 
VALUES ('HfTiz4WZrRXQi5AW70alVw', '6ErzHIq4Fak7NdH7gzNdbtaEWvzLZrawIivBkSKzY', 'ios team', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO mobile.client_ids_secrets(client_id, client_secret, description, active, created_at, updated_at) 
VALUES ('IfTiz4WZrRXQi5AW70alVx', '7ErzHIq4Fak7NdH7gzNdbtaEWvzLZrawIivBkSKzY', 'android team', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
