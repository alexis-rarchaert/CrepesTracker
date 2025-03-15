CREATE DATABASE crepes_app;

CREATE TABLE users (
                       id INT PRIMARY KEY AUTO_INCREMENT,
                       notion_workspace VARCHAR(255) NOT NULL,
                       name VARCHAR(100) NOT NULL
);

CREATE TABLE orders (
                        id INT PRIMARY KEY AUTO_INCREMENT,
                        user_id INT,
                        group_code VARCHAR(8),
                        status ENUM('pending', 'preparing', 'ready') DEFAULT 'pending',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE order_items (
                             id INT PRIMARY KEY AUTO_INCREMENT,
                             order_id INT,
                             crepe_type VARCHAR(50),
                             quantity INT CHECK (quantity <= 2),
                             FOREIGN KEY (order_id) REFERENCES orders(id)
);