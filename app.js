//1.0.0-10
const express = require('express');
const path = require('path');
const cors = require('cors')
const bodyParser = require('body-parser')
const { Client } = require('@notionhq/client');
const mysql = require('mysql2/promise');
const https = require('https');
const fs = require('node:fs');
const app = express();
const port = 80;
const webpush = require('web-push');

const vapidKeys = {
    publicKey:
        'BI_-zsHnL4wu28le_1iEFTqz1Anf-wUAJRFSCvZ3gLrRy2SORJ8xBNdHHdGg6Q8BFaqA6DfSM8IceQF4Wtq71m0',
    privateKey: 'R6gHZGGgAbGgpO0DavsGj43OY2s7h_mpy_Ep4hKGvcI',
}

webpush.setVapidDetails(
    'mailto:bonjour@alexis-rarchaert.fr',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

const NOTION_CLIENT_ID = '191d872b-594c-80dd-b394-00372fd1641d';
const NOTION_CLIENT_SECRET = 'secret_vQH4tiSLJnAnhLDAOz3UckMekqqwUyKzequbAQiBKJD';
const REDIRECT_URI = 'https://nuitaliut.preview.notabl.fr/auth/notion/callback';

// Configuration de la base de données
const pool = mysql.createPool({
    host: '87.106.78.211',
    user: 'crepesapp',
    password: 'crepesapp@',
    database: 'crepesapp'
});

app.use(express.json());
app.use(express.static('public'));
app.use(cors(
    {
        origin: '*',
    }
));

const dummyDb = { subscription: null }

let commandesActives;

const saveToDatabase = async subscription => {
    dummyDb.subscription = subscription
}

app.post('/save-subscription', async (req, res) => {
    const { subscription, userId } = req.body;

    try {
        await pool.query(
            'UPDATE users SET push_subscription = ? WHERE id = ?',
            [JSON.stringify(subscription), userId]
        );

        res.json({ message: 'Subscription enregistrée' });
        console.log("SOUSCRIPTION ENREGISTREE POUR USER:", userId);
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ error: 'Erreur lors de l\'enregistrement' });
    }
});

const sendNotification = (subscription, dataToSend) => {
    if (typeof dataToSend === 'string') {
        dataToSend = JSON.parse(dataToSend);
    }
    webpush.sendNotification(subscription, JSON.stringify(dataToSend));
};

app.post('/send-notification/:userId', async (req, res) => {
    if(req.params.userId === 'all') {
        try {
            const [users] = await pool.query(
                'SELECT push_subscription FROM users WHERE push_subscription IS NOT NULL'
            );

            for (const user of users) {
                const subscription = JSON.parse(user.push_subscription);
                const { title, message } = req.body; // Add this line
                const notificationData = { title, message };

                await sendNotification(subscription, notificationData);
                console.log("MESSAGE ENVOYÉ A TOUS LES UTILISATEURS");
            }

            res.json({ message: 'Message envoyé à tous les utilisateurs' });
        } catch (error) {
            console.error('Erreur:', error);
            res.status(500).json({ error: 'Erreur lors de l\'envoi' });
        }
    }
    else {
        try {
            const { title, message } = req.body;

            const [users] = await pool.query(
                'SELECT push_subscription FROM users WHERE id = ?',
                [req.params.userId]
            );

            if (users.length === 0 || !users[0].push_subscription) {
                return res.status(404).json({ error: 'Subscription non trouvée' });
            }

            const subscription = JSON.parse(users[0].push_subscription);
            const notificationData = { title, message };

            await webpush.sendNotification(subscription, JSON.stringify(notificationData));
            return res.json({ message: 'Message envoyé' });
        } catch (error) {
            console.error('Erreur:', error);
            return res.status(500).json({ error: 'Erreur lors de l\'envoi' });
        }
    }
});

app.get('/auth/notion', (req, res) => {
    const notionAuthUrl = `https://api.notion.com/v1/oauth/authorize?owner=user&client_id=${NOTION_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code`;
    res.redirect(notionAuthUrl);
});

app.get('/auth/notion/callback', async (req, res) => {
    const { code } = req.query;

    try {
        // Échanger le code contre un token d'accès
        const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI
            })
        });

        const tokenData = await tokenResponse.json();

        // Récupérer les informations de l'utilisateur
        const userResponse = await fetch('https://api.notion.com/v1/users/me', {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Notion-Version': '2022-06-28'
            }
        });

        const userData = await userResponse.json();
        const userEmail = userData.bot.owner.user.person.email;
        const userName = userData.bot.owner.user.name;

        if (
            !userEmail.endsWith('@etu.iut-tlse3.fr') &&
            !userEmail.endsWith('@iut-tlse3.fr') &&
            !userEmail.endsWith('romainraynaud81@gmail.com') &&
            !userEmail.endsWith('elliessmahir8@gmail.com') &&
            !userEmail.endsWith('hombert.fabien@gmail.com') &&
            !userEmail.endsWith('grayssaguel.fabien@gmail.com') &&
            !userEmail.endsWith('mathilde97133@gmail.com')
        ) {
            return res.redirect('/?error=email_non_autorise');
        }

        // Vérifier/créer l'utilisateur dans la base de données
        const [users] = await pool.query(
            'SELECT id FROM users WHERE notion_workspace = ?',
            [userEmail]
        );

        let userId;
        if (users.length > 0) {
            userId = users[0].id;
        } else {
            const [result] = await pool.query(
                'INSERT INTO users (notion_workspace, name) VALUES (?, ?)',
                [userEmail, userName]
            );
            userId = result.insertId;
        }

        // Rediriger vers la page principale avec l'ID utilisateur
        res.redirect(`/?userId=${userId}`);
    } catch (error) {
        console.error('Erreur OAuth:', error);
        res.redirect('/?error=auth_failed');
    }
});

app.post('/api/commandes/toggle', async (req, res) => {
    try {
        commandesActives = !commandesActives;
        await pool.query(
            'UPDATE settings SET value = ? WHERE name = ?',
            [JSON.stringify(commandesActives), 'commandes_actives']
        );
        res.json({ active: commandesActives });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/commandes/toggle', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT value FROM settings WHERE name = ?',
            ['commandes_actives']
        );
        const commandesActives = rows.length > 0 ? JSON.parse(rows[0].value) : true;
        res.json({ active: commandesActives });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/commandes/count/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const [rows] = await pool.query(`
            SELECT COUNT(*) as count
            FROM orders o
            WHERE o.user_id = ?
            AND DATE(o.created_at) = CURDATE()
            AND o.status != 'finished'
        `, [userId]);
        res.json({ count: rows[0].count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/commandes/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const [rows] = await pool.query(`
            SELECT o.id, o.status, o.created_at,
                   oi.crepe_type
            FROM orders o
                     LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.user_id = ?
            ORDER BY o.id DESC
        `, [userId]);

        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/commandes', async (req, res) => {
    try {
        // Récupérer toutes les commandes non terminées
        const [rows] = await pool.query(`
            SELECT o.id, o.status, o.created_at, o.user_id,
                   oi.crepe_type,
                   u.name as user_name,
                   COUNT(o2.id) as commandes_avant
            FROM orders o
                     LEFT JOIN orders o2 ON o2.id < o.id
                AND o2.status != 'finished'
                     LEFT JOIN order_items oi ON o.id = oi.order_id
                     LEFT JOIN users u ON o.user_id = u.id
            WHERE o.status != 'finished'
            GROUP BY o.id
            ORDER BY o.id DESC
        `);

        if(rows.length === 0) {
            return res.json({
                temps_attente: 0
            });
        }
        const commandesAvecTemps = rows.map(commande => ({
            ...commande,
            temps_attente: commande.commandes_avant * 90
        }));

        res.json(commandesAvecTemps);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route pour créer une nouvelle commande
app.post('/api/commandes', async (req, res) => {
    const { userId, crepeType } = req.body;

    // Validate required fields
    if (!userId) {
        return res.status(400).json({ error: 'UserId requis' });
    }
    if (!crepeType) {
        return res.status(400).json({ error: 'Type de crêpe requis' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Check if crepe type is available
        const [types] = await connection.query(
            'SELECT active FROM crepe_types WHERE type = ?',
            [crepeType]
        );

        if (types.length === 0 || !types[0].active) {
            await connection.rollback();
            return res.status(400).json({ error: 'Type de crêpe non disponible' });
        }

        // Check user order count
        const [orders] = await connection.query(
            'SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND DATE(created_at) = CURDATE() AND status != "finished"',
            [userId]
        );

        if (orders[0].count >= 2) {
            await connection.rollback();
            return res.status(400).json({ error: 'Limite de commandes atteinte' });
        }

        // Create order
        const [orderResult] = await connection.query(
            'INSERT INTO orders (user_id, status) VALUES (?, ?)',
            [userId, 'pending']
        );

        // Add order items
        await connection.query(
            'INSERT INTO order_items (order_id, crepe_type, quantity) VALUES (?, ?, ?)',
            [orderResult.insertId, crepeType, 1]
        );

        await connection.commit();
        res.json({ id: orderResult.insertId });
    } catch (error) {
        await connection.rollback();
        console.error('Order creation error:', error);
        res.status(500).json({ error: 'Erreur lors de la création de la commande' });
    } finally {
        connection.release();
    }
});

// Route pour mettre à jour le statut d'une commande
app.put('/api/commandes/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        if (!['pending', 'preparing', 'ready', 'finished'].includes(status)) {
            return res.status(400).json({ error: 'Statut invalide' });
        }

        const [order] = await pool.query(
            'SELECT user_id FROM orders WHERE id = ?',
            [id]
        );

        if (order.length === 0) {
            return res.status(404).json({ error: 'Commande non trouvée' });
        }

        const [result] = await pool.query(
            'UPDATE orders SET status = ? WHERE id = ?',
            [status, id]
        );

        // Récupérer le subscription du user
        const [subscriptions] = await pool.query(
            'SELECT push_subscription FROM users WHERE id = ?',
            [order[0].user_id]
        );

        if (subscriptions.length > 0 && subscriptions[0].push_subscription) {
            const subscription = JSON.parse(subscriptions[0].push_subscription);
            const message = {
                title: '👨‍🍳 Crêpe Tracker',
                message: getStatusMessage(status)
            };

            await webpush.sendNotification(subscription, JSON.stringify(message));
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function getStatusMessage(status) {
    switch(status) {
        case 'preparing':
            return '🥞 Votre crêpe est en préparation !';
        case 'ready':
            return '🥞 Votre crêpe est prête !';
        case 'finished':
            return '🥞 Votre crêpe a été servie.';
        default:
            return '🥞 État de votre commande mis à jour.';
    }
}

app.post('/api/notifications/subscribe', async (req, res) => {
    const { userId, subscription } = req.body;

    try {
        await pool.query(
            'UPDATE users SET push_subscription = ? WHERE id = ?',
            [JSON.stringify(subscription), userId]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route pour la page cuisine
app.get('/kitchen', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'kitchen.html'));
});

const httpsOptions = {
    key: fs.readFileSync('private.key'),
    cert: fs.readFileSync('certificate.crt')
};

// https.createServer(httpsOptions, app).listen(port, () => {
//     console.log(`Secure server started on https://localhost:${port}`);
// });

app.listen(port, () => {
    console.log(`Server started on http://localhost:${port}`);
});

async function initSettings() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL UNIQUE,
                value JSON NOT NULL
            )
        `);

        const [rows] = await pool.query(
            'SELECT value FROM settings WHERE name = ?',
            ['commandes_actives']
        );

        if (rows.length === 0) {
            await pool.query(
                'INSERT INTO settings (name, value) VALUES (?, ?)',
                ['commandes_actives', JSON.stringify(true)]
            );
            commandesActives = true;
        } else {
            commandesActives = JSON.parse(rows[0].value);
        }
    } catch (error) {
        // Only log real errors, not the duplicate entry error
        if (error.code !== 'ER_DUP_ENTRY') {
            console.error('Erreur initialisation settings:', error);
        }
    }
}

// Get beverages
app.get('/api/beverages', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM beverages WHERE active = true'
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update beverage quantity
app.put('/api/beverages/:id', async (req, res) => {
    const { id } = req.params;
    const { quantity, active } = req.body;

    try {
        await pool.query(
            'UPDATE beverages SET quantity = ?, active = ? WHERE id = ?',
            [quantity, active, id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add crepes settings table and routes
app.get('/api/crepes/types', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM crepe_types');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/crepes/types/:type', async (req, res) => {
    const { type } = req.params;
    const { active } = req.body;
    try {
        await pool.query(
            'UPDATE crepe_types SET active = ? WHERE type = ?',
            [active, type]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

initSettings();