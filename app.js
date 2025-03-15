//1.0.0-5
const express = require('express');
const path = require('path');
const cors = require('cors')
const bodyParser = require('body-parser')
const { Client } = require('@notionhq/client');
const mysql = require('mysql2/promise');
const https = require('https');
const fs = require('node:fs');
const app = express();
const port = 8080;
const webpush = require('web-push');

const vapidKeys = {
    publicKey:
        'BPKA_V-IMOyMx8YLS7zBeWdYrznd64Ee5Ll8J-lG4n6cnwYE751PVgwix8RpyGLo4j_1cKMkIrjaPWdGu1whJto',
    privateKey: 'XLPYm2dXuZqtACQiCodin-uPkQPC7Iv8MidbrV16UwI',
}

webpush.setVapidDetails(
    'mailto:bonjour@alexis-rarchaert.fr',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

const NOTION_CLIENT_ID = '191d872b-594c-80dd-b394-00372fd1641d';
const NOTION_CLIENT_SECRET = 'secret_vQH4tiSLJnAnhLDAOz3UckMekqqwUyKzequbAQiBKJD';
const REDIRECT_URI = 'https://preview.notabl.fr:8080/auth/notion/callback';

// Configuration de la base de données
const pool = mysql.createPool({
    host: '87.106.78.211',
    user: 'crepesapp',
    password: 'crepesapp@',
    database: 'crepesapp'
});

app.use(express.json());
app.use(express.static('public'));

const dummyDb = { subscription: null }

const saveToDatabase = async subscription => {
    dummyDb.subscription = subscription
}

app.post('/save-subscription', async (req, res) => {
    const subscription = req.body
    await saveToDatabase(subscription) //Method to save the subscription to Database
    res.json({ message: 'success' });

    console.log("SOUSCRIPTION ENREGISTREE");
});

const sendNotification = (subscription, dataToSend = '') => {
    webpush.sendNotification(subscription, dataToSend);
};

app.get('/send-notification', (req, res) => {
    const subscription = dummyDb.subscription //get subscription from your databse here.
    const message = 'Hello World'
    sendNotification(subscription, message)
    res.json({ message: 'message sent' });

    console.log("MESSAGE ENVOYE");
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

        if (!userEmail.endsWith('@etu.iut-tlse3.fr') && !userEmail.endsWith('@iut-tlse3.fr')) {
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

// Modifier la route de comptage des commandes
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
            temps_attente: commande.commandes_avant * 90 // en secondes
        }));

        res.json(commandesAvecTemps);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route pour créer une nouvelle commande
app.post('/api/commandes', async (req, res) => {
    const { userId, crepeType } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'UserId requis' });
    }
    if (!['nature', 'sucre', 'nutella'].includes(crepeType)) {
        return res.status(400).json({ error: 'Type de crêpe invalide' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [orderResult] = await connection.query(
            'INSERT INTO orders (user_id, status) VALUES (?, ?)',
            [userId, 'pending']
        );

        await connection.query(
            'INSERT INTO order_items (order_id, crepe_type, quantity) VALUES (?, ?, ?)',
            [orderResult.insertId, crepeType, 1]
        );

        await connection.commit();
        res.json({ id: orderResult.insertId });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
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
                orderId: id,
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
            return 'Votre crêpe est en préparation !';
        case 'ready':
            return 'Votre crêpe est prête !';
        case 'finished':
            return 'Votre crêpe a été servie.';
        default:
            return 'État de votre commande mis à jour.';
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

https.createServer(httpsOptions, app).listen(port, () => {
    console.log(`Secure server started on https://localhost:${port}`);
});