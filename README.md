👾
# kis-BBR 

## Overview

An automated service that's seamlessly integrated with the Korona system. This service is designed to make your life easier by automatically generating detailed product reports and sending them directly to your customers' inboxes.

## What Does The Code Do?

- **Fetches Product Data**: The code communicates with the Korona API to fetch product information, including stock levels.
  
- **Generates Excel Reports**: Utilizes the ExcelJS library to create Excel spreadsheets that summarize the fetched product data. The reports are saved locally as `.xlsx` files.
  
- **Automates Email Dispatch**: After generating the reports, the code initiates a Java workflow to automate the email dispatch process, ensuring that the reports reach your customers.

- **Timezone-Aware Date Handling**: The code is designed to handle dates in the "America/New_York" timezone, ensuring that the reports are generated for the correct date.

- **Server-Side Logic**: Built on Node.js and Express, the code runs on a server and listens on port 3000. It exposes an endpoint `/generateReport` that triggers the report generation and email dispatch process.

## Prerequisites

Before running the code, make sure to install the required libraries:

\```bash
npm install http express child_process exceljs node-fetch
\```
