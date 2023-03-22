const express = require("express");
const app = express();
const cors = require("cors");
const http = require("http");
const mediasoup = require("mediasoup");
const server = http.createServer(app);
const { config } = require("./config/index");

// app.use(cors());

const { Server } = require("socket.io");
const {
  createUser,
  getUsers,
  removeUser,
  saveProducerId,
  saveConsumerId,
} = require("./utils");
const io = new Server(server);

let worker;
let router;
let transports = {};
let producers = [];
let consumers = [];
let isSessionMuted = false;

setupMediasoup();

/* ***MEDIASOUP*** */
const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
];
async function setupMediasoup() {
  worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
  });
  console.log(`Worker pid: ${worker.pid}`);
  worker.on("died", (error) => {
    console.error("Mediasoup worker has died :(");
    setTimeout(() => process.exit(1), 2000);
  });

  router = await worker.createRouter({ mediaCodecs });
}

io.on("connection", (socket) => {
  console.log(`Connected: ${socket.id}`);
  createUser(socket.id);

  const currentUsers = getUsers();

  socket.emit("get:startingPackage", {
    rtpCapabilities: router.rtpCapabilities,
    users: currentUsers,
  });

  socket.on("disconnect", () => {
    console.log(`Disconnected: ${socket.id}`);
    removeUser(socket.id);
    // TO DO: Clean up audio stuff
  });

  socket.on("request:webRtcTransport", async ({ sender }, callback) => {
    const transport = await createWebRtcTransport(callback);
    transports[transport.id] = transport;
  });

  socket.on("transportConnect", async ({ dtlsParameters, id }) => {
    console.log("DTLS PARAMS... ", { dtlsParameters });
    const transport = transports[id];
    await transport.connect({ dtlsParameters });
  });

  socket.on(
    "transportProduce",
    async ({ kind, rtpParameters, appData, id }, callback) => {
      // call produce based on the prameters from the client
      const transport = transports[id];
      const producer = await transport.produce({
        kind,
        rtpParameters,
      });

      producers.push(producer);
      saveProducerId(socket.id, producer.id);

      socket.broadcast.emit("newUser", {
        id: socket.id,
        producerId: producer.id,
        consumerId: "",
      });

      producer.on("transportclose", () => {
        console.log("transport for this producer closed ");
        producer.close();
      });

      // Send back to the client the Producer's id
      callback({
        id: producer.id,
      });
    }
  );

  socket.on("transportRecvConnect", async ({ dtlsParameters, id }) => {
    console.log(`DTLS PARAMS: ${dtlsParameters}`);
    const transport = transports[id];
    await transport.connect({ dtlsParameters });
  });

  socket.on(
    "consume",
    async ({ rtpCapabilities, producerId, consumerTransportId }, callback) => {
      const producer = getProducerById(producerId);
      try {
        // check if the router can consume the specified producer
        if (
          router.canConsume({
            producerId: producer.id,
            rtpCapabilities,
          })
        ) {
          // transport can now consume and return a consumer
          const transport = transports[consumerTransportId];
          const consumer = await transport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: true,
          });

          consumers.push(consumer);
          saveConsumerId(socket.id, consumer.id);

          consumer.on("transportclose", () => {
            console.log("transport close from consumer");
          });

          consumer.on("producerclose", () => {
            console.log("producer of consumer closed");
          });

          // from the consumer extract the following params
          // to send back to the Client
          const params = {
            id: consumer.id,
            producerId: producer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          };

          // send the parameters to the client
          callback({ params });
        }
      } catch (error) {
        console.log(error.message);
        callback({
          params: {
            error: error,
          },
        });
      }
    }
  );

  socket.on("consumerResume", async ({ consumerId }) => {
    console.log("consumer resume", consumerId);
    const consumer = getConsumerById(consumerId);
    await consumer.resume();
  });

  socket.on("producerPause", async ({ id }) => {
    console.log("producer pause", id);
    const producer = getProducerById(id);
    await producer.pause();
  });

  socket.on("producerResume", async ({ id }) => {
    console.log("producer resume", id);
    const producer = getProducerById(id);
    await producer.resume();
  });

  socket.on("toggleMuteSession", async ({ id }) => {
    if (isSessionMuted) {
      producers.forEach((producer) => {
        producer.resume()
      })
  
      consumers.forEach((consumer) => {
        consumer.resume()
      })

      io.emit("unmute");

      isSessionMuted = false;
    } else {
      producers.forEach((producer) => {
        producer.pause()
      })
      consumers.forEach((consumer) => {
        consumer.pause()
      })
      isSessionMuted = true;

      io.emit("unmute");
    }
  });

});

server.listen(config.port, function () {
  console.log(`Listening http://localhost:${config.port}`);
});

const createWebRtcTransport = async (callback) => {
  try {
    // https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
    const webRtcTransport_options = {
      listenIps: [
        {
          ip: "0.0.0.0",
          announcedIp: config.publicIP,
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    };

    let transport = await router.createWebRtcTransport(webRtcTransport_options);
    console.log(`transport id: ${transport.id}`);

    transport.on("dtlsstatechange", (dtlsState) => {
      if (dtlsState === "closed") {
        transport.close();
      }
    });

    transport.on("close", () => {
      console.log("transport closed");
    });

    // send back to the client the following prameters
    callback({
      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    });

    return transport;
  } catch (error) {
    console.log(error);
    callback({
      params: {
        error,
      },
    });
  }
};

// Functions - helpers
function getProducerById(id) {
  const producer = producers.find((producer) => producer.id === id);
  return producer;
}

function getConsumerById(id) {
  const consumer = consumers.find((consumer) => consumer.id === id);
  return consumer;
}
