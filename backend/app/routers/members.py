"""
Member Management Router - KYC Module
Handles member registration, updates, and KYC compliance
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
import os
import shutil

from app.database import get_db
from app.auth import get_current_user, require_teller, require_member_access, generate_member_id
from app.audit import AuditLogger
from app import models, schemas

router = APIRouter(prefix="/members", tags=["Member Management"])

# Upload directory for KYC documents
UPLOAD_DIR = "/app/uploads/kyc"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("", response_model=schemas.MemberResponse)
async def create_member(
    request: Request,
    member_data: schemas.MemberCreate,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Register a new member with KYC information
    
    - Generates unique Member ID with check digit
    - Validates required KYC fields per COBAC regulations
    """
    # Check if national ID already exists
    if member_data.national_id:
        existing = db.query(models.Member).filter(
            models.Member.national_id == member_data.national_id
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Member with this National ID already exists"
            )
    
    # Generate unique member ID
    member_id = generate_member_id()
    
    # Ensure uniqueness
    while db.query(models.Member).filter(models.Member.member_id == member_id).first():
        member_id = generate_member_id()
    
    # Create member
    new_member = models.Member(
        member_id=member_id,
        first_name=member_data.first_name,
        last_name=member_data.last_name,
        date_of_birth=member_data.date_of_birth,
        gender=member_data.gender,
        marital_status=member_data.marital_status,
        national_id=member_data.national_id,
        phone_primary=member_data.phone_primary,
        phone_secondary=member_data.phone_secondary,
        email=member_data.email,
        address=member_data.address,
        next_of_kin_name=member_data.next_of_kin_name,
        next_of_kin_phone=member_data.next_of_kin_phone,
        next_of_kin_relationship=member_data.next_of_kin_relationship,
        geo_latitude=member_data.geo_latitude,
        geo_longitude=member_data.geo_longitude,
        branch_id=member_data.branch_id,
        registered_by=current_user.id
    )
    
    db.add(new_member)
    db.commit()
    db.refresh(new_member)
    
    # Log member creation
    audit = AuditLogger(db, current_user, request)
    audit.log_create(
        entity_type="Member",
        entity_id=str(new_member.id),
        new_values={
            "member_id": new_member.member_id,
            "name": f"{new_member.first_name} {new_member.last_name}",
            "national_id": new_member.national_id,
            "phone": new_member.phone_primary,
            "branch_id": new_member.branch_id
        },
        description=f"Registered new member {new_member.member_id}"
    )
    
    return schemas.MemberResponse.model_validate(new_member)


@router.get("", response_model=List[schemas.MemberResponse])
async def list_members(
    search: Optional[str] = Query(None, description="Search by name, member ID, or phone"),
    branch_id: Optional[int] = Query(None),
    is_active: Optional[bool] = Query(True),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: models.User = Depends(require_member_access),
    db: Session = Depends(get_db)
):
    """
    List members with search and filter options
    """
    query = db.query(models.Member)
    
    # Filter by branch if teller (can only see their branch)
    if current_user.role.value == "TELLER" and current_user.branch_id:
        query = query.filter(models.Member.branch_id == current_user.branch_id)
    elif branch_id:
        query = query.filter(models.Member.branch_id == branch_id)
    
    if is_active is not None:
        query = query.filter(models.Member.is_active == is_active)
    
    # Search functionality
    if search:
        search_filter = f"%{search}%"
        # Also match concatenated first+last name for full-name searches like "Acham Cho"
        full_name_col = func.concat(models.Member.first_name, ' ', models.Member.last_name)
        query = query.filter(
            (models.Member.first_name.ilike(search_filter)) |
            (models.Member.last_name.ilike(search_filter)) |
            (full_name_col.ilike(search_filter)) |
            (models.Member.member_id.ilike(search_filter)) |
            (models.Member.phone_primary.ilike(search_filter)) |
            (models.Member.national_id.ilike(search_filter))
        )
    
    members = query.order_by(models.Member.created_at.desc()).offset(skip).limit(limit).all()
    
    return [schemas.MemberResponse.model_validate(m) for m in members]


@router.get("/{member_id}", response_model=schemas.MemberDetailResponse)
async def get_member(
    request: Request,
    member_id: int,
    current_user: models.User = Depends(require_member_access),
    db: Session = Depends(get_db)
):
    """
    Get member details with accounts and loans
    """
    member = db.query(models.Member).filter(models.Member.id == member_id).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found"
        )
    
    # Log view
    audit = AuditLogger(db, current_user, request)
    audit.log_view(
        entity_type="Member",
        entity_id=str(member.id),
        description=f"Viewed member {member.member_id}"
    )
    
    return schemas.MemberDetailResponse.model_validate(member)


@router.get("/by-member-id/{member_id_str}", response_model=schemas.MemberDetailResponse)
async def get_member_by_member_id(
    request: Request,
    member_id_str: str,
    current_user: models.User = Depends(require_member_access),
    db: Session = Depends(get_db)
):
    """
    Get member by member ID (e.g., M123456789)
    """
    member = db.query(models.Member).filter(
        models.Member.member_id == member_id_str
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found"
        )
    
    # Log view
    audit = AuditLogger(db, current_user, request)
    audit.log_view(
        entity_type="Member",
        entity_id=str(member.id),
        description=f"Viewed member {member.member_id}"
    )
    
    return schemas.MemberDetailResponse.model_validate(member)


@router.get("/by-account/{account_id}", response_model=schemas.MemberDetailResponse)
async def get_member_by_account_id(
    request: Request,
    account_id: int,
    current_user: models.User = Depends(require_member_access),
    db: Session = Depends(get_db)
):
    """
    Get member details via an associated account ID
    """
    account = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )
    
    member = db.query(models.Member).filter(models.Member.id == account.member_id).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member associated with this account not found"
        )
    
    return schemas.MemberDetailResponse.model_validate(member)


@router.put("/{member_id}", response_model=schemas.MemberResponse)
async def update_member(
    request: Request,
    member_id: int,
    member_data: schemas.MemberUpdate,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Update member information
    """
    member = db.query(models.Member).filter(models.Member.id == member_id).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found"
        )
    
    # Store old values for audit
    old_values = {
        "phone_primary": member.phone_primary,
        "phone_secondary": member.phone_secondary,
        "email": member.email,
        "address": member.address,
        "next_of_kin_name": member.next_of_kin_name,
        "next_of_kin_phone": member.next_of_kin_phone,
        "next_of_kin_relationship": member.next_of_kin_relationship,
        "geo_latitude": float(member.geo_latitude) if member.geo_latitude else None,
        "geo_longitude": float(member.geo_longitude) if member.geo_longitude else None
    }
    
    # Update fields
    if member_data.phone_primary is not None:
        member.phone_primary = member_data.phone_primary
    if member_data.phone_secondary is not None:
        member.phone_secondary = member_data.phone_secondary
    if member_data.email is not None:
        member.email = member_data.email
    if member_data.address is not None:
        member.address = member_data.address
    if member_data.next_of_kin_name is not None:
        member.next_of_kin_name = member_data.next_of_kin_name
    if member_data.next_of_kin_phone is not None:
        member.next_of_kin_phone = member_data.next_of_kin_phone
    if member_data.next_of_kin_relationship is not None:
        member.next_of_kin_relationship = member_data.next_of_kin_relationship
    if member_data.geo_latitude is not None:
        member.geo_latitude = member_data.geo_latitude
    if member_data.geo_longitude is not None:
        member.geo_longitude = member_data.geo_longitude
    
    db.commit()
    db.refresh(member)
    
    # Log update
    audit = AuditLogger(db, current_user, request)
    audit.log_update(
        entity_type="Member",
        entity_id=str(member.id),
        old_values=old_values,
        new_values={
            "phone_primary": member.phone_primary,
            "phone_secondary": member.phone_secondary,
            "email": member.email,
            "address": member.address,
            "next_of_kin_name": member.next_of_kin_name,
            "next_of_kin_phone": member.next_of_kin_phone,
            "next_of_kin_relationship": member.next_of_kin_relationship,
            "geo_latitude": float(member.geo_latitude) if member.geo_latitude else None,
            "geo_longitude": float(member.geo_longitude) if member.geo_longitude else None
        },
        description=f"Updated member {member.member_id}"
    )
    
    return schemas.MemberResponse.model_validate(member)


@router.post("/{member_id}/upload-id")
async def upload_national_id(
    request: Request,
    member_id: int,
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Upload National ID scan for KYC
    """
    member = db.query(models.Member).filter(models.Member.id == member_id).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found"
        )
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Allowed: JPEG, PNG, PDF"
        )
    
    # Save file
    file_ext = file.filename.split(".")[-1]
    file_name = f"national_id_{member.member_id}_{int(os.path.getmtime(__file__))}.{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, file_name)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Update member record
    member.national_id_scan_path = file_path
    db.commit()
    
    # Log upload
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="KYC_DOCUMENT_UPLOAD",
        entity_type="Member",
        entity_id=str(member.id),
        description=f"Uploaded National ID for member {member.member_id}"
    )
    
    return {"message": "National ID uploaded successfully", "file_path": file_path}


@router.post("/{member_id}/upload-photo")
async def upload_passport_photo(
    request: Request,
    member_id: int,
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Upload passport photo for KYC
    """
    member = db.query(models.Member).filter(models.Member.id == member_id).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found"
        )
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Allowed: JPEG, PNG"
        )
    
    # Save file
    file_ext = file.filename.split(".")[-1]
    file_name = f"photo_{member.member_id}.{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, file_name)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Update member record
    member.passport_photo_path = file_path
    db.commit()
    
    # Log upload
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="KYC_PHOTO_UPLOAD",
        entity_type="Member",
        entity_id=str(member.id),
        description=f"Uploaded passport photo for member {member.member_id}"
    )
    
    return {"message": "Passport photo uploaded successfully", "file_path": file_path}

@router.post("/{member_id}/upload-signature")
async def upload_signature_scan(
    request: Request,
    member_id: int,
    file: UploadFile = File(...),
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Upload signature scan for Teller verification
    """
    member = db.query(models.Member).filter(models.Member.id == member_id).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found"
        )
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Allowed: JPEG, PNG"
        )
    
    # Save file
    file_ext = file.filename.split(".")[-1]
    file_name = f"signature_{member.member_id}.{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, file_name)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Update member record
    member.signature_scan_path = file_path
    db.commit()
    
    # Log upload
    audit = AuditLogger(db, current_user, request)
    audit.log(
        action="KYC_SIGNATURE_UPLOAD",
        entity_type="Member",
        entity_id=str(member.id),
        description=f"Uploaded signature scan for member {member.member_id}"
    )
    
    return {"message": "Signature scan uploaded successfully", "file_path": file_path}


@router.get("/{member_id}/photo")
async def get_member_photo(
    member_id: int,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Get member passport photo for Teller verification screen
    """
    member = db.query(models.Member).filter(models.Member.id == member_id).first()
    
    if not member or not member.passport_photo_path or not os.path.exists(member.passport_photo_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Photo not found"
        )
        
    return FileResponse(member.passport_photo_path)


@router.get("/{member_id}/signature")
async def get_member_signature(
    member_id: int,
    current_user: models.User = Depends(require_teller),
    db: Session = Depends(get_db)
):
    """
    Get member signature scan for Teller verification screen
    """
    member = db.query(models.Member).filter(models.Member.id == member_id).first()
    
    if not member or not member.signature_scan_path or not os.path.exists(member.signature_scan_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signature not found"
        )
        
    return FileResponse(member.signature_scan_path)
@router.get("/stats/summary")
async def get_member_statistics(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get member statistics for dashboard
    """
    query = db.query(models.Member)
    
    # Filter by branch if teller
    if current_user.role.value == "TELLER" and current_user.branch_id:
        query = query.filter(models.Member.branch_id == current_user.branch_id)
    
    total_members = query.count()
    active_members = query.filter(models.Member.is_active == True).count()
    
    # New members this month
    from datetime import datetime
    current_month = datetime.now().replace(day=1)
    new_this_month = query.filter(models.Member.created_at >= current_month).count()
    
    return {
        "total_members": total_members,
        "active_members": active_members,
        "new_this_month": new_this_month
    }