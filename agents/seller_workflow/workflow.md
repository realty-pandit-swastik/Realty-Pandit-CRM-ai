# Seller Agent Workflow

## Responsibilities
- **Seller Onboarding**: Collect property details and verify ownership.
- **Property Listing Logic**: Format text/images for listings.
- **Verification**: Ensure all SSOT fields (price, area, papers) are present.
- **Inventory Management**: Update status (Available/Sold).

## Inputs
- **Seller Request**: "I want to sell my plot."
- **Documents**: Photos, property papers.

## Outputs
- **Verified Listing**: Ready for the database.
- **Verification Status**: Pending/Approved.

## Interaction with Other Agents
- **Backend Agent**: Saves property to DB.
- **Dealer Agent**: Notifies dealer of new inventory.
