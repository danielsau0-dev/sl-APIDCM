require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
const cheerio= require('cheerio');
const https = require('https');
const fs = require('fs');
const app = express();
const cors = require('cors');
const options = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH || 'C:\\Program Files\\OpenSSL-Win64\\key.pem'),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH || 'C:\\Program Files\\OpenSSL-Win64\\cert.pem')
  };

const router = express.Router();

const ORTHANC_URL = process.env.ORTHANC_URL || "http://192.9.200.10:8042";
const ORTHANC_USER = process.env.ORTHANC_USER || "adminpacs";
const ORTHANC_PASS = process.env.ORTHANC_PASS || "0rth4ncs";
const ORTHANC_REMOTE_AE = process.env.ORTHANC_REMOTE_AE || "Carestream";

const port = parseInt(process.env.PORT, 10) || 3333;
const PACS_HOST = process.env.PACS_HOST || '192.9.200.50';
const PACS_PORT = parseInt(process.env.PACS_PORT, 10) || 2104;
const PACS_AE_LOCAL = process.env.PACS_AE_LOCAL || 'SCU';
const PACS_AE_REMOTE = process.env.PACS_AE_REMOTE || 'mnmxsrvFIR';

const dcmjsDimse = require('dcmjs-dimse');
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://192.9.200.20:5173', 'http://192.9.200.20:3001'];
const corsOptions = {
    origin: corsOrigins,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
// Middleware para parsear JSON
app.use(express.json());

// Ruta básica
app.get('/verificarEstudio/', (req, res) => {

 const {  accessionNumber, StudyDate, modality } = req.query;
 

  if (  !accessionNumber || !StudyDate || !modality) {
  return res.status(405).send("Parámetros insuficientes");
  }
  console.log("parametros:::");
  console.log( accessionNumber, StudyDate, modality );

  const { Client } = dcmjsDimse;
   const { CEchoRequest } = dcmjsDimse.requests;
        const { Status } = dcmjsDimse.constants;

      const client = new Client();
      //const request = new CEchoRequest();
      //const dcmjsDimse = require('dcmjs-dimse');

      const { CFindRequest } = dcmjsDimse.requests;


      //const client = new Client();
      const request = CFindRequest.createStudyFindRequest({ 
          
          AccessionNumber: accessionNumber,
          ModalitiesInStudy: modality,
      });
      request.on('response', (response) => {
         // console.log(response);
        if (response.getStatus() === Status.Pending && response.hasDataset()) {
          
          console.log("studyDate",StudyDate);
          console.log(" get studyDate", response.dataset.elements.StudyDate);
          if(StudyDate===response.dataset.elements.StudyDate){
              res.status(200).send("OK");
          }else{
              res.status(200).send("FAIL");
          }
        
      }else {
          res.status(200).send("FAIL");}
      });
      client.addRequest(request);
      client.on('networkError', (e) => {
        console.log('Network error: ', e);
      });
      client.send(PACS_HOST, PACS_PORT, PACS_AE_LOCAL, PACS_AE_REMOTE);
});


app.get('/getInformationEstudio/', (req, res) => {
  const { StudyDate, modality } = req.query;
  
  console.log("Parámetros de búsqueda:", StudyDate, modality);

  const { Client } = dcmjsDimse;
  const { CFindRequest } = dcmjsDimse.requests;
  const { Status } = dcmjsDimse.constants;

  const client = new Client();
  
  // Crear el request con los filtros de búsqueda
  const request = CFindRequest.createStudyFindRequest({ 
    StudyDate: StudyDate, // Agregar la fecha como filtro
    ModalitiesInStudy: modality,
    // Campos adicionales que queremos recibir en la respuesta
    PatientName: '',
   
    AccessionNumber: '',
    StudyDescription: '',
    StudyInstanceUID: ''
  });

  let studies = []; // Array para almacenar los resultados

  request.on('response', (response) => {
    if (response.getStatus() === Status.Pending && response.hasDataset()) {
      // Extraer la información relevante del dataset
      const study = {
        patientName: response.dataset.elements.PatientName,
       
        accessionNumber: response.dataset.elements.AccessionNumber,
        studyDate: response.dataset.elements.StudyDate,
        studyDescription: response.dataset.elements.StudyDescription,
        studyInstanceUid: response.dataset.elements.StudyInstanceUID,
        modality: response.dataset.elements.ModalitiesInStudy
      };
      
      studies.push(study);
    } else if (response.getStatus() === Status.Success) {
      // Cuando se complete la búsqueda, enviar todos los resultados
      res.json({
        status: 'success',
        data: studies
      });
    }
  });

  client.addRequest(request);

  client.on('networkError', (e) => {
    console.log('Network error: ', e);
    res.status(500).json({
      status: 'error',
      message: 'Network error occurred',
      error: e.message
    });
  });

  // Conectar al servidor PACS
  client.send(PACS_HOST, PACS_PORT, PACS_AE_LOCAL, PACS_AE_REMOTE);
})


app.get("/getSeriesByStudy", (req, res) => {

  const { studyUID } = req.query;

  if (!studyUID) {
    return res.status(400).json({ error: "studyUID requerido" });
  }

  console.log("Buscar series StudyUID:", studyUID);

  const { Client } = dcmjsDimse;
  const { CFindRequest } = dcmjsDimse.requests;
  const { Status } = dcmjsDimse.constants;

  const client = new Client();

  const request = CFindRequest.createSeriesFindRequest({

    StudyInstanceUID: studyUID,

    // campos que queremos recibir
    SeriesInstanceUID: '',
    SeriesDescription: '',
    SeriesNumber: '',
    Modality: '',
    SeriesTime: '',
    ProtocolName: '',
    NumberOfSeriesRelatedInstances: '',
    BodyPartExamined: ''

  });

  const series = [];

  request.on("response", (response) => {

    if (response.getStatus() === Status.Pending && response.hasDataset()) {

      const ds = response.dataset.elements;

      const serie = {
     seriesUID: ds.SeriesInstanceUID,
  description: ds.SeriesDescription,
  number: ds.SeriesNumber,
  modality: ds.Modality,
  time: ds.SeriesTime,
  protocol: ds.ProtocolName,
  bodyPart: ds.BodyPartExamined,
  images: ds.NumberOfSeriesRelatedInstances
      };

      console.log("Serie:", serie);

      series.push(serie);
    }

    if (response.getStatus() === Status.Success) {

      console.log("Consulta finalizada");

      res.json({
        status: "success",
        data: series
      });

    }

  });

  client.addRequest(request);

  client.on("networkError", (e) => {
    console.log("Network error:", e);
    res.status(500).json({
      status: "error",
      message: "Error conectando PACS",
      error: e.message
    });
  });

  client.send(PACS_HOST, PACS_PORT, PACS_AE_LOCAL, PACS_AE_REMOTE);

});




app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);

  });


