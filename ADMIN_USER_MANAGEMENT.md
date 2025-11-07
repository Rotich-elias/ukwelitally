# Admin User Management Features

## Overview

The admin dashboard now includes complete user management capabilities for viewing, editing, and deleting candidates, agents, and observers.

---

## Features Implemented

### 1. View User Details
- **Access**: Click the eye icon in the Actions column
- **Shows**: Complete user information including:
  - Basic details (name, email, phone, ID number, status)
  - Role-specific information
  - Creation and update timestamps
  - For candidates: Party, position, electoral area
  - For agents: Assigned candidate, polling station

### 2. Edit User
- **Access**: Click the edit icon (pencil) in the Actions column
- **Editable Fields**:
  - Full name
  - Email address
  - Phone number
  - Active/Inactive status
- **Restrictions**:
  - Role and ID number cannot be changed
  - Profile-specific data (party, position, etc.) cannot be changed
  - To modify these, admin must delete and recreate the user

### 3. Delete User
- **Access**: Click the delete icon (trash) in the Actions column
- **Safety Features**:
  - Confirmation dialog with user details
  - Cannot delete your own account
  - Cascading deletion of related records (candidate/agent profiles)
  - Audit log entry created

---

## API Endpoints

### GET /api/admin/users
**Purpose**: List all users with optional role filtering

**Query Parameters**:
- `role` (optional): Filter by role (candidate, agent, observer, admin)

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "email": "user@example.com",
      "phone": "+254712345678",
      "full_name": "John Doe",
      "role": "candidate",
      "verified": true,
      "active": true,
      "created_at": "2025-01-07T10:00:00Z",
      "profile_id": 5
    }
  ]
}
```

---

### GET /api/admin/users/[id]
**Purpose**: Get detailed information about a specific user

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "candidate@example.com",
    "phone": "+254712345678",
    "full_name": "John Doe",
    "role": "candidate",
    "id_number": "12345678",
    "verified": true,
    "active": true,
    "created_at": "2025-01-07T10:00:00Z",
    "updated_at": "2025-01-07T12:00:00Z",
    "profile": {
      "candidate_id": 5,
      "party_name": "ODM",
      "position": "mca",
      "county_name": "NAIROBI",
      "constituency_name": "DAGORETTI NORTH",
      "ward_name": "Ward 1"
    }
  }
}
```

---

### PUT /api/admin/users
**Purpose**: Update user information

**Request Body**:
```json
{
  "user_id": 1,
  "email": "newemail@example.com",
  "phone": "+254712345678",
  "full_name": "Updated Name",
  "active": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "User updated successfully",
  "data": {
    "id": 1,
    "email": "newemail@example.com",
    ...
  }
}
```

---

### DELETE /api/admin/users?user_id={id}
**Purpose**: Delete a user and all related data

**Response**:
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

**Safety Checks**:
- Prevents deleting your own account
- Creates audit log entry
- Cascades to delete candidate/agent profiles

---

## User Interface

### Users Table
Located at: `/dashboard/admin`

**Columns**:
1. **Name**: User's full name
2. **Email**: Contact email
3. **Phone**: Phone number
4. **Role**: Candidate, Agent, Observer, or Admin (color-coded badges)
5. **Status**: Active or Inactive (color-coded badges)
6. **Created**: Account creation date
7. **Actions**: Three icon buttons (View, Edit, Delete)

**Filters**:
- Dropdown to filter by role (All, Candidate, Agent, Observer)

---

### View Details Modal

**Displays**:
- **Basic Information**: Name, email, phone, ID number, role, status
- **Timestamps**: Created date/time, last updated date/time
- **Candidate-Specific**: Party name, position, electoral area
- **Agent-Specific**: Assigned candidate, polling station details

**Layout**: Clean, organized grid layout with labeled sections

---

### Edit User Modal

**Form Fields**:
- Full Name (text input)
- Email (email input)
- Phone (tel input)
- Status (dropdown: Active/Inactive)

**Features**:
- Real-time form validation
- Warning message about non-editable fields
- Cancel button to discard changes
- Save button to apply changes

---

### Delete Confirmation Modal

**Features**:
- Red warning color scheme
- Large warning icon
- Summary of user being deleted
- List of what will be deleted
- Prominent "Delete User" button
- Cancel button to abort

---

## Security & Audit

### Authentication
- All endpoints require admin JWT token
- Role verification before any operation
- Cannot delete own account

### Audit Logging
Every action is logged in `audit_logs` table:

**Create**:
```sql
INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address)
```

**Update**:
```sql
INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
```

**Delete**:
```sql
INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, ip_address)
```

---

## Database Operations

### Cascading Deletes
When a user is deleted:
1. Delete candidate profile (if exists)
2. Delete agent profile (if exists)
3. Delete user record
4. Create audit log entry

```typescript
await query('DELETE FROM candidates WHERE user_id = $1', [userId])
await query('DELETE FROM agents WHERE user_id = $1', [userId])
await query('DELETE FROM users WHERE id = $1', [userId])
```

### Dynamic Updates
Only changed fields are updated:
```typescript
const updates: string[] = []
if (email !== currentUser.email) {
  updates.push(`email = $${paramIndex}`)
  params.push(email)
}
// ... etc
```

---

## Usage Examples

### Example 1: View Candidate Details
1. Admin logs in → Dashboard
2. Filter: "Candidate"
3. Click eye icon on candidate row
4. View modal shows:
   - Full name, email, phone
   - Party: ODM
   - Position: MCA
   - Electoral Area: Ward 1, Dagoretti North, Nairobi

### Example 2: Edit User Email
1. Admin clicks edit icon on user row
2. Edit modal opens with current data
3. Admin changes email address
4. Clicks "Save Changes"
5. Success message displays
6. Table refreshes with updated email

### Example 3: Delete Inactive Agent
1. Admin filters by "Agent"
2. Identifies inactive agent
3. Clicks delete icon
4. Confirmation modal shows:
   - Agent name: John Smith
   - Role: agent
   - Email: agent@example.com
5. Admin confirms deletion
6. Agent and related data deleted
7. Audit log created
8. Success message displays
9. Table refreshes

---

## Error Handling

### Common Errors

**Unauthorized**:
```json
{
  "error": "Unauthorized"
}
```
*Solution*: User must login as admin

**User Not Found**:
```json
{
  "error": "User not found"
}
```
*Solution*: Check user ID is correct

**Cannot Delete Own Account**:
```json
{
  "error": "Cannot delete your own account"
}
```
*Solution*: Have another admin delete the account

**No Changes to Update**:
```json
{
  "error": "No changes to update"
}
```
*Solution*: Modify at least one field before saving

---

## Files Modified

### API Routes
1. `/src/app/api/admin/users/route.ts`
   - Added `PUT` method for updates
   - Added `DELETE` method for deletions
   - Enhanced `GET` with better filtering

2. `/src/app/api/admin/users/[id]/route.ts` **(NEW)**
   - `GET` method to fetch individual user details
   - Includes full profile information

### Frontend
1. `/src/app/dashboard/admin/page.tsx`
   - Added state for view/edit/delete modals
   - Added handler functions
   - Added Actions column to table
   - Created three modal components

---

## Best Practices

### When to Use Each Feature

**View Details**:
- Verify user information before making changes
- Check candidate electoral area
- Confirm agent polling station assignment
- Review user creation date

**Edit User**:
- Update contact information
- Fix typos in name
- Deactivate/reactivate accounts
- Change email address

**Delete User**:
- Remove duplicate accounts
- Remove test accounts
- Remove users who no longer need access
- Clean up after elections

**Do NOT** delete users to:
- Change their role (create new account instead)
- Modify candidate position (create new account)
- Update electoral area (create new account)

---

## Testing Checklist

- [ ] View candidate details shows party and electoral area
- [ ] View agent details shows assigned candidate
- [ ] Edit user updates name successfully
- [ ] Edit user updates email successfully
- [ ] Edit user updates phone successfully
- [ ] Edit user can activate/deactivate account
- [ ] Delete shows confirmation dialog
- [ ] Delete removes user from table
- [ ] Delete creates audit log entry
- [ ] Cannot delete own admin account
- [ ] Table refreshes after each operation
- [ ] Success/error messages display correctly
- [ ] All modals can be closed with X button
- [ ] All modals can be closed with Cancel button

---

## Future Enhancements

Potential improvements to consider:

1. **Bulk Actions**: Select multiple users and delete/activate/deactivate at once
2. **Password Reset**: Admin can reset user passwords
3. **Export**: Export user list to CSV/Excel
4. **Search**: Search users by name, email, or phone
5. **Pagination**: Handle large numbers of users
6. **Sort**: Click column headers to sort
7. **Advanced Filters**: Filter by multiple criteria
8. **User Activity**: Show last login time
9. **Bulk Import**: Import users from CSV
10. **Email Notifications**: Notify users when their account is edited

---

**Version:** 1.0
**Date:** January 2025
**Status:** ✅ Fully Implemented
**Build Status:** ✅ TypeScript Compiles Successfully
