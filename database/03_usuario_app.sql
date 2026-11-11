CREATE USER IF NOT EXISTS 'transport_app'@'%' IDENTIFIED BY 'TransPort_2026';
ALTER USER 'transport_app'@'%' IDENTIFIED BY 'TransPort_2026';
GRANT SELECT, INSERT, UPDATE, DELETE ON transport_db.* TO 'transport_app'@'%';
FLUSH PRIVILEGES;
