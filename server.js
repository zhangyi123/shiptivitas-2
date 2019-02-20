import express from 'express';
import Database from 'better-sqlite3';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  return res.status(200).send({'message': 'SHIPTIVITY API. Read documentation to see API docs'});
});

// We are keeping one connection alive for the rest of the life application for simplicity
const db = new Database('./clients.db');

// Don't forget to close connection when server gets terminated
const closeDb = () => db.close();
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

/**
 * Validate id input
 * @param {any} id
 */
const validateId = (id) => {
  if (Number.isNaN(id)) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid id provided.',
      'long_message': 'Id can only be integer.',
      },
    };
  }
  const client = db.prepare('select * from clients where id = ? limit 1').get(id);
  if (!client) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid id provided.',
      'long_message': 'Cannot find client with that id.',
      },
    };
  }
  return {
    valid: true,
  };
}

/**
 * Validate priority input
 * @param {any} priority
 */
const validatePriority = (priority) => {
  if (Number.isNaN(priority)) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid priority provided.',
      'long_message': 'Priority can only be positive integer.',
      },
    };
  }
  return {
    valid: true,
  }
}

/**
 * Get all of the clients. Optional filter 'status'
 * GET /api/v1/clients?status={status} - list all clients, optional parameter status: 'backlog' | 'in-progress' | 'complete'
 */
app.get('/api/v1/clients', (req, res) => {
  const status = req.query.status;
  if (status) {
    // status can only be either 'backlog' | 'in-progress' | 'complete'
    if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
      return res.status(400).send({
        'message': 'Invalid status provided.',
        'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
      });
    }
    const clients = db.prepare('select * from clients where status = ?').all(status);
    return res.status(200).send(clients);
  }
  const statement = db.prepare('select * from clients');
  const clients = statement.all();
  return res.status(200).send(clients);
});

/**
 * Get a client based on the id provided.
 * GET /api/v1/clients/{client_id} - get client by id
 */
app.get('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id , 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }
  return res.status(200).send(db.prepare('select * from clients where id = ?').get(id));
});

/**
 * Update client information based on the parameters provided.
 * When status is provided, the client status will be changed
 * When priority is provided, the client priority will be changed with the rest of the clients accordingly
 * Note that priority = 1 means it has the highest priority (should be on top of the swimlane).
 * No client on the same status should not have the same priority.
 * This API should return list of clients on success
 *
 * PUT /api/v1/clients/{client_id} - change the status of a client
 *    Data:
 *      status (optional): 'backlog' | 'in-progress' | 'complete',
 *      priority (optional): integer,
 *
 */
app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id , 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }

  let { status, priority } = req.body;
  let clients = db.prepare('select * from clients').all();
  const client = clients.find(client => client.id === id);

  /* ---------- Update code below ----------*/

  if(status==null){
    //same swim lane
      helper(client, priority, res);
  }else {
    if(client.status === status){
      //same swim lane
      helper(client, priority, res);
    }else{
      //diffrent swim lanes
      let stmt1, stmt2, stmtDel;
      const clientsTargetStatus = db.prepare('select * from clients where status = ?').all(status);
      if(priority==null || priority > clientsTargetStatus.length + 1) priority = clientsTargetStatus.length + 1;
      stmt1 = db.prepare('update clients set priority = priority-1 where priority > ? and status = ?'); //priority
      stmt2 = db.prepare('update clients set priority = priority+1 where priority >= ? and status = ?');
      stmtDel = db.prepare('update clients set priority = ?, status = ? where id = ?'); //client.id
      stmt1.run(client.priority, client.status); //remove from lane
      stmt2.run(priority, status) //insert to new lane
      stmtDel.run(priority, status, client.id);
      return res.status(204).send("Resource Updated successfully");
    }
  }
  return res.status(200).send(client);
});
function helper(client, priorityWanted, res){
  if(priorityWanted==null || priorityWanted == client.priority) return res.status(200).send("Nothing to be updated\n");
  else{
    let stmt;
    if(client.priority < priorityWanted){
      const clientsSameStatus = db.prepare('select * from clients where status = ?').all(client.status);
      if(clientsSameStatus.length < priorityWanted)
        priorityWanted = clientsSameStatus.length;
      stmt = db.prepare('update clients set priority = priority-1 where priority <= ? and priority > ? and status == ?');
    }else{
      stmt = db.prepare('update clients set priority = priority+1 where priority >= ? and priority < ? and status == ?');
    }
    const stmtSelf = db.prepare('update clients set priority = ? where id = ?');
    //(update).get() not working, db.run not working
    stmt.run(priorityWanted, client.priority, client.status);
    stmtSelf.run(priorityWanted, client.id);
    return res.status(204).send("Resource updated successfully"); //seems like not executing this line
  }
}
app.listen(3001);
console.log('app running on port ', 3001);
