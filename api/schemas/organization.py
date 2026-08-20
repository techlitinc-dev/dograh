from pydantic import BaseModel

from api.enums import OrganizationRole


class OrganizationMember(BaseModel):
    user_id: int
    email: str | None = None
    role: str
    is_you: bool


class OrganizationMemberRoleUpdateRequest(BaseModel):
    role: OrganizationRole


class OrganizationUpdateRequest(BaseModel):
    name: str | None = None
