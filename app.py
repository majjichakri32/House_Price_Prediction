from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Literal

import pandas as pd
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from xgboost import XGBRegressor
from xgboost.core import Booster


ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "model.sav"
STATIC_PATH = ROOT / "static"
AGE_GROUPS = ["0-10", "11-20", "21-30", "31-40", "41-50", "50+"]
FEATURES = [
    "MedInc",
    "HouseAge",
    "AveRooms",
    "AveBedrms",
    "Population",
    "AveOccup",
    "Latitude",
    "Longitude",
    "Age_Group",
]


class ModelUnpickler(pickle.Unpickler):
    def find_class(self, module: str, name: str):
        allowed = {
            ("xgboost.sklearn", "XGBRegressor"): XGBRegressor,
            ("xgboost.core", "Booster"): Booster,
            ("builtins", "bytearray"): bytearray,
        }
        try:
            return allowed[(module, name)]
        except KeyError as error:
            raise pickle.UnpicklingError(
                f"Unsupported model pickle global: {module}.{name}"
            ) from error


def load_model() -> XGBRegressor:
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(
            f"Model file not found at {MODEL_PATH}. Add the supplied model as model.sav."
        )
    with MODEL_PATH.open("rb") as model_file:
        model = ModelUnpickler(model_file).load()
    if not isinstance(model, XGBRegressor):
        raise TypeError("model.sav does not contain an XGBRegressor.")
    booster_features = model.get_booster().feature_names
    if booster_features and booster_features != FEATURES:
        raise ValueError(
            "The supplied model's feature order does not match the report's input schema."
        )
    return model


model = load_model()
app = FastAPI(title="House Price Prediction", version="1.0.0")
app.mount("/static", StaticFiles(directory=STATIC_PATH), name="static")


class HouseModelInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    MedInc: float = Field(gt=0, le=15.0001)
    HouseAge: float = Field(ge=1, le=52)
    AveRooms: float = Field(gt=0, le=141.909)
    AveBedrms: float = Field(gt=0, le=34.067)
    Population: float = Field(ge=3, le=35682)
    AveOccup: float = Field(gt=0, le=1243.333)
    Latitude: float = Field(ge=32.54, le=41.95)
    Longitude: float = Field(ge=-124.35, le=-114.31)
    Age_Group: Literal["0-10", "11-20", "21-30", "31-40", "41-50", "50+"]


@app.get("/", include_in_schema=False)
def home() -> FileResponse:
    return FileResponse(STATIC_PATH / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": "XGBRegressor"}


@app.post("/housePrice_prediction")
def house_price_prediction(inputs: HouseModelInput) -> dict[str, float]:
    frame = pd.DataFrame([inputs.model_dump()], columns=FEATURES)
    frame["Age_Group"] = pd.Categorical(
        frame["Age_Group"], categories=AGE_GROUPS
    )
    prediction = float(model.predict(frame)[0])
    return {
        "prediction": prediction,
        "prediction_usd": prediction * 100_000,
    }


@app.get("/api/analysis")
def analysis() -> dict:
    data = json.loads((STATIC_PATH / "analysis-data.json").read_text())
    data["dataset"] = {"records": 20640, "features": 8, "missing_values": 0}
    data["metrics"] = {
        "training": {"r2": 0.9475, "mae": 0.1868, "records": 16512},
        "test": {"r2": 0.8326, "mae": 0.3115, "records": 4128},
    }
    return data
