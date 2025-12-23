BEGIN;
truncate table pos.users cascade;
truncate  table pos.roles cascade;
UPDATE pos.users
SET password_hash = extensions.crypt('admin123', extensions.gen_salt('bf'))
WHERE username = 'admin';


INSERT INTO pos.roles (role_id,role_name) VALUES ('01','admin'),('02','manager'),('03','clerk');

INSERT INTO pos.users(username, password_hash)
VALUES ('admin', extensions.crypt('admin123', extensions.gen_salt('bf')));

INSERT INTO pos.users (user_id, password_hash, role_id, is_active, company_id)
VALUES
  ('Arthy',    '$2b$10$vrGYz97xFxgOuMouFZxAV.Qo.54.IhEpl5REk2i6aLldonR1aqdua',
               (SELECT role_id FROM pos.roles WHERE role_name = 'admin'),   TRUE, '01'),
  ('JSudhagar','$2b$10$.EwGy4R7euPgsSxSiRvgeulmN9UhY8JRJ.htf4DAXRDiENfBJNyBK',
               (SELECT role_id FROM pos.roles WHERE role_name = 'manager'), TRUE, '01'),
  ('Haniska',  '$2b$10$cQ..W64EtOY8XBlvh34MYOY4nxT4XVT9CvYWtwNtFQiL9.P/gEbmO',
               (SELECT role_id FROM pos.roles WHERE role_name = 'clerk'),   TRUE, '01');


commit;
end;
