from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import Dict, Any

from app.database import get_db
from app.auth import get_current_user
from app.services.kyc_ocr import extract_id_data

router = APIRouter(
    prefix="/kyc",
    tags=["KYC"],
    dependencies=[Depends(get_current_user)]
)

@router.post("/upload", response_model=Dict[str, Any])
async def upload_kyc_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload a CNI (identity card) image for automated OCR mapping.
    Extracts Full Name, Issue Date, Expiry Date, and ID Number.
    """
    if file.content_type not in ["image/jpeg", "image/png", "image/jpg"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only JPEG and PNG are supported."
        )
        
    try:
        contents = await file.read()
        
        # Run local CPU OCR processing
        extracted = extract_id_data(contents)
        
        if "error" in extracted and extracted["error"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"OCR Processing Failed: {extracted['error']}"
            )
            
        return extracted
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during file processing: {str(e)}"
        )
