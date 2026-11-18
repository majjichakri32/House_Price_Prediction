# House Price Prediction

A California neighborhood median-value demo based on the XGBRegressor and workflow described in the project report. The FastAPI backend serves the web app, validates input, and returns predictions using the supplied `model.sav`.

## Run locally

Python 3.10 or newer is required.

```bash
python -m pip install -r requirements.txt
npm start
```

`npm start` runs the Python API at <http://localhost:3000>. To start it without npm:

```bash
python -m uvicorn app:app --host 0.0.0.0 --port 3000
```

## Prediction API

`POST /housePrice_prediction` accepts the eight numeric California housing features and an `Age_Group` value (`0-10`, `11-20`, `21-30`, `31-40`, `41-50`, or `50+`). The response includes `prediction` in the dataset's units of $100,000 and `prediction_usd`.

The app also includes a data-analysis view with the report's dataset summary, age-group charts, reported correlations, and model evaluation scores. The estimates are educational neighborhood-level estimates, not individual home valuations; the source dataset caps its target near $500,000.
