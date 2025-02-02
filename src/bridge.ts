import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as fetch from 'isomorphic-fetch';
import * as moment from 'moment';
import * as uuidv4 from 'uuid/v4';
import { IActivity, IBotData, IConversation, IConversationUpdateActivity, IMessageActivity } from './types';

interface String {
    endsWith(searchString: string, endPosition?: number): boolean;
}

const expiresIn = 1800;
const conversationsCleanupInterval = 10000;
const conversations: { [key: string]: IConversation } = {};
const botDataStore: { [key: string]: IBotData } = {};
const bearerStirng = "Bearer ";
const guidPrefixString = "ofdl-";

export const getRouter = (serviceUrl: string, botUrl: string, conversationInitRequired = true): express.Router => {
    const router = express.Router();

    router.use(bodyParser.json()); // for parsing application/json
    router.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
    router.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, PATCH, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-ms-bot-agent');
        next();
    });

    // CLIENT ENDPOINT
    router.options('/*', (req, res) => {
        res.status(200).end();
    });

    router.options('/directline', (req, res) => {
        res.status(200).end();
    });

    router.options('/v3?/directline', (req, res) => {
        res.status(200).end();
    });

    // Creates a conversation
    router.post('/v3?/directline/conversations', (req, res) => {
        var authToken = getConversationIdFromAuthToken(req.headers.authorization); 
        const conversationId = conversations[authToken].conversationId;
       
        console.log('post /v3?/directline/conversations Created conversation with conversationId: ' + conversationId);
        
        const activity = createConversationUpdateActivity(serviceUrl, conversationId);
        fetch(botUrl, {
            method: 'POST',
            body: JSON.stringify(activity),
            headers: {
                'Content-Type': 'application/json',
            },
        }).then((response) => {
            res.status(response.status).send({
                conversationId,
                expires_in: expiresIn,
            });
        });
    });

    // Reconnect API
    router.get('/v3/directline/conversations/:conversationId', (req, res) => {
        const conversationId = req.params.conversationId;
        console.log('get /v3/directline/conversations/:conversationId  with conversationId: ' + conversationId);

        const activity = createConversationUpdateActivity(serviceUrl, conversationId);
        fetch(botUrl, {
            method: 'POST',
            body: JSON.stringify(activity),
            headers: {
                'Content-Type': 'application/json',
            },
        }).then((response) => {
            res.status(response.status).send({
                conversationId,
                expires_in: expiresIn,
            });
        });
    });

    // Gets activities from store (local history array for now)
    router.get('/v3?/directline/conversations/:conversationId/activities', (req, res) => {
        const watermark = req.query.watermark && req.query.watermark !== 'null' ? Number(req.query.watermark) : 0;

        const conversation = getConversation(req.params.conversationId, conversationInitRequired);
        console.log('get /v3?/directline/conversations/:conversationId/activities  with conversationId: ' + req.params.conversationId);
        if (conversation) {
            // If the bot has pushed anything into the history array
            if (conversation.history.length > watermark) {
                const activities = conversation.history.slice(watermark);
                res.status(200).json({
                    activities,
                    watermark: watermark + activities.length,
                });
            } else {
                res.status(200).send({
                    activities: [],
                    watermark,
                });
            }
        } else {
            // Conversation was never initialized
            res.status(400).send();
        }
    });

    // Sends message to bot. Assumes message activities
    router.post('/v3?/directline/conversations/:conversationId/activities', (req, res) => {
        const incomingActivity = req.body;
        // Make copy of activity. Add required fields
        const activity = createMessageActivity(incomingActivity, serviceUrl, req.params.conversationId);

        const conversation = getConversation(req.params.conversationId, conversationInitRequired);
        console.log('post /v3?/directline/conversations/:conversationId/activities with conversationId: ' + req.params.conversationId);
        if (conversation) {
            conversation.history.push(activity);
            fetch(botUrl, {
                method: 'POST',
                body: JSON.stringify(activity),
                headers: {
                    'Content-Type': 'application/json',
                },
            }).then((response) => {
                res.status(response.status).json({ id: activity.id });
            });
        } else {
            // Conversation was never initialized
            res.status(400).send();
        }
    });

    router.post('/v3/directline/conversations/:conversationId/upload', (req, res) => { console.warn('/v3/directline/conversations/:conversationId/upload not implemented'); });
    router.get('/v3/directline/conversations/:conversationId/stream', (req, res) => { console.warn('/v3/directline/conversations/:conversationId/stream not implemented'); });

    // BOT CONVERSATION ENDPOINT
    router.post('/v3/conversations', (req, res) => { console.warn('/v3/conversations not implemented'); });

    router.post('/v3/conversations/:conversationId/activities', (req, res) => {
        let activity: IActivity;

        activity = req.body;
        activity.id = uuidv4();
        activity.from = { id: 'id', name: 'Bot' };

        console.log('post /v3/conversations/:conversationId/activities  with conversationId: ' + req.params.conversationId);
        const conversation = getConversation(req.params.conversationId, conversationInitRequired);
        if (conversation) {
            conversation.history.push(activity);
            res.status(200).send();
        } else {
            // Conversation was never initialized
            res.status(400).send();
        }
    });

    router.post('/v3/conversations/:conversationId/activities/:activityId', (req, res) => {
        console.log('post /v3/conversations/:conversationId/activities/:activityId  with conversationId: ' + req.params.conversationId);
        let activity: IActivity;

        activity = req.body;
        activity.id = uuidv4();
        activity.from = { id: 'id', name: 'Bot' };

        const conversation = getConversation(req.params.conversationId, conversationInitRequired);
        if (conversation) {
            conversation.history.push(activity);
            res.status(200).send();
        } else {
            // Conversation was never initialized
            res.status(400).send();
        }
    });

    router.get('/v3/conversations/:conversationId/members', (req, res) => { console.warn('/v3/conversations/:conversationId/members not implemented'); });
    router.get('/v3/conversations/:conversationId/activities/:activityId/members', (req, res) => { console.warn('/v3/conversations/:conversationId/activities/:activityId/members'); });

    // BOTSTATE ENDPOINT

    router.get('/v3/botstate/:channelId/users/:userId', (req, res) => {
        console.log('Called GET user data');
        getBotData(req, res);
    });

    router.get('/v3/botstate/:channelId/conversations/:conversationId', (req, res) => {
        console.log(('Called GET conversation data'));
        getBotData(req, res);
    });

    router.get('/v3/botstate/:channelId/conversations/:conversationId/users/:userId', (req, res) => {
        console.log('Called GET private conversation data');
        getBotData(req, res);
    });

    router.post('/v3/botstate/:channelId/users/:userId', (req, res) => {
        console.log('Called POST setUserData');
        setUserData(req, res);
    });

    router.post('/v3/botstate/:channelId/conversations/:conversationId', (req, res) => {
        console.log('Called POST setConversationData');
        setConversationData(req, res);
    });

    router.post('/v3/botstate/:channelId/conversations/:conversationId/users/:userId', (req, res) => {
        console.log('post /v3/botstate/:channelId/conversations/:conversationId/users/:userId  with conversationId: ' + req.params.conversationId);
        setPrivateConversationData(req, res);
    });

    router.delete('/v3/botstate/:channelId/users/:userId', (req, res) => {
        console.log('Called DELETE deleteStateForUser');
        deleteStateForUser(req, res);
    });

    router.post('/v3?/directline/tokens/generate', (req, res) => {
        const conversationId: string = guidPrefixString + uuidv4().toString();
        const authThoken:string = conversationId;

        conversations[conversationId] = {
            conversationId,
            history: [],
            token: authThoken
        };
        
        console.log('Created conversation with conversationId on generate: ' + conversationId);

        console.log(('Called GET tokens generate'));
        res.status(200).send({
            token: authThoken,
            conversationId,
            expires_in: expiresIn,
        });
    });

    router.post('/v3?/directline/tokens/refresh', (req, res) => {
        
        var conversationId: string = guidPrefixString + uuidv4().toString();

        if (Object.keys(conversations).length == 0) {
            conversations[conversationId] = {
                conversationId,
                history: [],
                token: conversationId
            };
            
            console.log('Refreshed conversation with conversationId on generate: ' + conversationId);
        }
        else { 

            //try gets conversation using authToken
            var authThoken:string = getConversationIdFromAuthToken(req.headers.authorization);
            conversationId = conversations[authThoken].conversationId;
            console.log('Refreshed conversation with conversationId on generate: ' + conversationId);
        }
        
        console.log(('Called GET tokens Refresh'));
        res.status(200).send({
            token: conversationId,
            conversationId,
            expires_in: expiresIn,
        });
    });

    return router;
};

/**
 * @param app The express app where your offline-directline endpoint will live
 * @param serviceUrl The port where your offline-directline will be hosted
 * @param botUrl The url of the bot (e.g. http://127.0.0.1:3978/api/messages)
 * @param conversationInitRequired Requires that a conversation is initialized before it is accessed, returning a 400
 * when not the case. If set to false, a new conversation reference is created on the fly. This is true by default.
 */
export const initializeRoutes = (app: express.Express, serviceUrl: string = 'http://127.0.0.1:3000', botUrl: string, conversationInitRequired = true) => {
    conversationsCleanup();

    var protocol = "http"
    if (serviceUrl.startsWith("http://"))
        serviceUrl = serviceUrl.replace("http://", "")
    else if (serviceUrl.startsWith("https://"))
    {
        protocol = "https"
        serviceUrl = serviceUrl.replace("https://", "")
    }

    var up = serviceUrl.split(':')

    var base = "127.0.0.1"
    var port = 3000

    if (up.length == 2)
    { 
        base = up[0]
        port = +up[1] 
    }
    else {
        if (isNaN(+up[0]))
        { 
            base = up[0]
            port = 80
        }
        else { 
            port = +up[0]
        }
    }

    const directLineEndpoint = `${protocol}://${base}:${port}`;
    const router = getRouter(directLineEndpoint, botUrl, conversationInitRequired);

    app.use(router);
    app.listen(port, () => {
        console.log(`Listening for messages from client on ${directLineEndpoint}`);
        console.log(`Routing messages to bot on ${botUrl}`);
    });
};

const getConversation = (conversationId: string, conversationInitRequired: boolean) => {

    // Create conversation on the fly when needed and init not required
    if (!conversations[conversationId] && !conversationInitRequired) {
        conversations[conversationId] = {
            conversationId,
            history: [],
            token:conversationId
        };
    }
    return conversations[conversationId];
};

const getBotDataKey = (channelId: string, conversationId: string, userId: string) => {
    return `$${channelId || '*'}!${conversationId || '*'}!${userId || '*'}`;
};

const setBotData = (channelId: string, conversationId: string, userId: string, incomingData: IBotData): IBotData => {
    const key = getBotDataKey(channelId, conversationId, userId);
    const newData: IBotData = {
        eTag: new Date().getTime().toString(),
        data: incomingData.data,
    };

    if (incomingData) {
        botDataStore[key] = newData;
    } else {
        delete botDataStore[key];
        newData.eTag = '*';
    }

    return newData;
};

const getBotData = (req: express.Request, res: express.Response) => {
    const key = getBotDataKey(req.params.channelId, req.params.conversationId, req.params.userId);
    console.log('Data key: ' + key);

    res.status(200).send(botDataStore[key] || { data: null, eTag: '*' });
};

const setUserData = (req: express.Request, res: express.Response) => {
    res.status(200).send(setBotData(req.params.channelId, req.params.conversationId, req.params.userId, req.body));
};

const setConversationData = (req: express.Request, res: express.Response) => {
    res.status(200).send(setBotData(req.params.channelId, req.params.conversationId, req.params.userId, req.body));
};

const setPrivateConversationData = (req: express.Request, res: express.Response) => {
    res.status(200).send(setBotData(req.params.channelId, req.params.conversationId, req.params.userId, req.body));
};

const deleteStateForUser = (req: express.Request, res: express.Response) => {
    Object.keys(botDataStore)
        .forEach((key) => {
            if (key.endsWith(`!{req.query.userId}`)) {
                delete botDataStore[key];
            }
        });
    res.status(200).send();
};

// CLIENT ENDPOINT HELPERS
const createMessageActivity = (incomingActivity: IMessageActivity, serviceUrl: string, conversationId: string): IMessageActivity => {
    return { ...incomingActivity, channelId: 'directline', serviceUrl, conversation: { id: conversationId }, id: uuidv4(), 
    recipient: { id: 'offline-directline', name: 'Offline Directline Server' } };
};

const createConversationUpdateActivity = (serviceUrl: string, conversationId: string): IConversationUpdateActivity => {
    const activity: IConversationUpdateActivity = {
        type: 'conversationUpdate',
        channelId: 'directline',
        serviceUrl,
        conversation: { id: conversationId },
        id: uuidv4(),
        membersAdded: [],
        membersRemoved: [],
        from: { id: 'offline-directline', name: 'Offline Directline Server' },
    };
    return activity;
};

const conversationsCleanup = () => {
    setInterval(() => {
        const expiresTime = moment().subtract(expiresIn, 'seconds');
        Object.keys(conversations).forEach((conversationId) => {
            if (conversations[conversationId].history.length > 0) {
                const lastTime = moment(conversations[conversationId].history[conversations[conversationId].history.length - 1].localTimestamp);
                if (lastTime < expiresTime) {
                    delete conversations[conversationId];
                    console.log('deleted cId: ' + conversationId);
                }
            }
        });
    }, conversationsCleanupInterval);
};


function getConversationIdFromAuthToken(authorizationToken: string): string {
    if (authorizationToken.includes(bearerStirng)) {
        var convId = authorizationToken.replace(bearerStirng, "");
        return convId;
    }

    return authorizationToken;
}


