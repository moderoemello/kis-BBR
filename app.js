const http = require('http');
const { exec } = require('child_process');
const express = require('express');
const ExcelJS = require('exceljs'); // Import the exceljs library
const app = express();
const port = 3000;

// Corrected Function to get the next date string in YYYY-MM-DD format
// This gets the date for today then subtracts 1 day to get the correct day every day
const getYesterdayDate = () => {
  const yesterday = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  yesterday.setDate(yesterday.getDate() - 1);
  return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
};

const getCurrentDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const currentDate = getCurrentDate();

// Not using currently but this assigns the to the report example report:2023-08-29
const reportName = getYesterdayDate();

let javaCmdDone = false;  

// Initialize minBookingTime and maxBookingTime
const minBookingTime = `${getYesterdayDate()}T00:00:00-06:00`;
const maxBookingTime = `${getYesterdayDate()}T23:59:59-06:00`;

async function initialize() {
  const fetchModule = await import('node-fetch');
  const fetch = fetchModule.default;

  // Auth function
  async function fetchData(url) {
    if (!url?.startsWith('http')) return console.warn('Invalid URL:', url) || null;
    const headers = {'Authorization': `Basic ${Buffer.from('ID:ID').toString('base64')}`};
    const response = await fetch(url, { method: 'GET', headers });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`Error fetching data: ${response.statusText}`);
    return response.json();
  }

  // Function to fetch stock levels
  async function fetchStock(productId) {
    try {
      console.log(`Fetching stock for product ID: ${productId}`);

      const url = `https://167.koronacloud.com/web/api/v3/accounts/ID/products/${productId}/stocks`;
      console.log(`API URL: ${url}`);

      const data = await fetchData(url);
      console.log(`Received data: ${JSON.stringify(data)}`);

      const actualAmount = data.results[0].amount.actual;
      console.log(`Actual amount in stock: ${actualAmount}`);

      return actualAmount;
    } catch (error) {
      console.warn(`Error fetching stock for product ${productId}: ${error.message}`);
      return 0;
    }
  }

  // Function to process pages and collect product data
  async function processPages(url, products = {}) {
    console.log(`Starting processPages with URL: ${url}`);

    if (!url) {
      console.warn('No URL provided for processPages');
      return products;
    }

    const data = await fetchData(url);
    console.log(`Fetched data: ${JSON.stringify(data)}`);

    if (!data || !data.results) {
      console.warn('No data found:', data);
      return products;
    }
    
    for (const receipt of data.results) {
      console.log(`Processing receipt: ${JSON.stringify(receipt)}`);
      // Skip voided or cancelled receipts
      if (receipt.voided || receipt.cancelled) {
        console.log('Skipping voided or cancelled receipt');
        continue; 
      }

      if (receipt.items) {
        for (const item of receipt.items) {
          console.log(`Processing item: ${JSON.stringify(item)}`);

          const name = item.product.name;
          const productId = item.product.id;
          const quantity = item.quantity;
          const stock = await fetchStock(productId);
          const commodityGroup = item.commodityGroup.name;

          console.log(`Item details - Name: ${name}, Product ID: ${productId}, Quantity: ${quantity}, Stock: ${stock}, Commodity Group: ${commodityGroup}`);

          if (!products[name]) {
            products[name] = {
              commodityGroup,
              quantity: 0,
              stock: 0
            };
          }

          products[name].commodityGroup = commodityGroup;
          products[name].quantity += quantity;
          products[name].stock = stock;
        }
      } else {
        console.warn('Items not found in receipt:', receipt);
      }
    }

    if (data.links.next) {
      console.log(`Found next page link: ${data.links.next}`);
      return processPages(data.links.next, products);
    }

    console.log(`Finished processing. Final products data: ${JSON.stringify(products)}`);
    return products;
  }

  app.get('/generateReport', async (req, res) => {
    console.log("Starting /generateReport endpoint");

    const url = `https://167.koronacloud.com/web/api/v3/accounts/ID/receipts?minBookingTime=${minBookingTime}&maxBookingTime=${maxBookingTime}&voidedItems=false`;
    console.log(`API URL for fetching receipts: ${url}`);

    const products = await processPages(url);
    console.log(`Processed products data: ${JSON.stringify(products)}`);

    // Convert the products object into an array of objects
    const productsArray = Object.entries(products).map(([name, details]) => ({
      CommodityGroup: details.commodityGroup,
      Name: name,
      Quantity_Sold: details.quantity,
      Stock_On_Hand: details.stock,
    }));

  // Sort the productsArray by CommodityGroup and then by Name
  productsArray.sort((a, b) => {
    if (a.CommodityGroup === b.CommodityGroup) {
      return a.Name.localeCompare(b.Name);
    }
    return a.CommodityGroup.localeCompare(b.CommodityGroup);
  });

    // Create a new Excel workbook and stream it directly to the response
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    // Add data to the worksheet
    worksheet.columns = [
      { header: 'Commodity', key: 'CommodityGroup', width: 10 },
      { header: 'Product Name', key: 'Name', width: 38 },
      { header: `Quantity Sold ${reportName}`, key: 'Quantity_Sold', width: 24 },
      { header: `Current Stock ${currentDate}`, key: 'Stock_On_Hand', width: 24 },
      { header: `NOTES`, key: '', width: 60 },
    ];
    // Add rows from your data (productsArray)
    productsArray.forEach((product) => {
      worksheet.addRow(product);
    });

    // Set content type and disposition for the response
// Save the Excel file to the local system as "report.xlsx"
const filePath = 'report.xlsx';
workbook.xlsx.writeFile(filePath)
  .then(() => {
    console.log('Excel file saved as report.xlsx');
    res.send('Excel file saved as report.xlsx'); // Send a response to the client
  })
  .catch((error) => {
    console.error(`Error writing Excel file: ${error}`);
    res.status(500).send('Error generating the report');
  });

    exec('java -jar /bin/workflow.jar --pretty --savePartialState -v', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${error}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
      javaCmdDone = true;  // Set the flag
      maybeExit();  // Check if it's time to exit
    });
  });
  
  // Function to check if all tasks are completed
  function maybeExit() {
    if (javaCmdDone) {
      process.exit(0);
    }
  }

  app.listen(port, () => {

    http.get(`http://localhost:${port}/generateReport?minBookingTime=${minBookingTime}&maxBookingTime=${maxBookingTime}`, (res) => {
      res.on('data', (chunk) => {

      });
      maybeExit();  // Check if it's time to exit
    }).on("error", (err) => {
    });
  });
}

initialize().catch(error => {
  console.error('Failed to initialize the server:', error);
});
