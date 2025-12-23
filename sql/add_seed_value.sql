delete from pos.companies cascade;
delete from pos.branches cascade ;
delete from pos.categories_major cascade;
delete from pos.categories_minor cascade;
delete from pos.packing_type cascade;
delete from pos.hsn_gst cascade;
delete from pos.products cascade;
delete from pos.branch_products cascade;
delete from pos.vendors cascade;
delete from pos.clients cascade;


INSERT INTO pos.companies (company_id, company_name,is_active)
VALUES ('01','Global Renga Foods (OPC) Pvt Ltd', TRUE);
INSERT INTO pos.companies (company_id, company_name,is_active)
VALUES ('02','Global Renga RETAILS Pvt Ltd', TRUE);

INSERT INTO pos.branches (company_id,state_id,branch_id,branch_name,is_active)
VALUES ('01','01','01','Main Branch ,Renga Nagar, Trichy',TRUE),
('01','01','02','Chatram Branch ,Chatram , Trichy',TRUE);

INSERT INTO pos.categories_major (major_id, major_name) VALUES ('01','Grocery');
INSERT INTO pos.categories_minor (major_id, minor_id, minor_name) VALUES ('01','02','Staples');

INSERT INTO pos.packing_type (pack_id, descr) VALUES ('BX','Box'),('PK','Pack');

INSERT INTO pos.hsn_gst (hsn_id, hsn_name, cgst_rate, sgst_rate, igst_rate)
VALUES ('10063000','Rice – Semi/Wholly Milled',0,0,0);

-- product_id = '0102BX'
INSERT INTO pos.products (major_id,minor_id,pack_id,hsn_id,sku_id,product_name)
VALUES ('01','02','BX','10063000','SKU-0102BX','Rice 5kg Box');

INSERT INTO pos.branch_products (company_id,state_id,branch_id,product_id,on_hand_qty,min_qty,sale_price,cost_price)
VALUES ('01','01','01','0102BX',10,5,100,80);

-- GLOBAL clients & vendors (no company_id)
INSERT INTO pos.clients (client_id, client_name) VALUES ('001','Cash Customer');
INSERT INTO pos.vendors (vendor_id, vendor_name) VALUES ('01','Acme Distributors');
commit;
