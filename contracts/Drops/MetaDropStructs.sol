// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

/**
 *  @notice This struct defining drop data of each private sale round.
 *
 *  @param startTime       Start time of a Drop round
 *  @param endTime         End time of a Drop round
 *  @param mintFee         A consistent fee of minting token.
 *  @param mintableLimit   Max amount of token each user can mint.
 */
struct DropRoundRecord {
    uint256 startTime;
    uint256 endTime;
    uint256 mintFee;
    uint256 mintableLimit;
}

/**
 *  @notice This struct defining data of each drop.
 *
 *  @param root                     This data contain merkle root that use for verifying whitelist member.
 *  @param owner                    Address of Drop owner.
 *  @param nft                      NFT address that be used for minting.
 *  @param paymentToken             Address of mintting payment token.
 *  @param fundingReceiver          Address of receving minting fee.
 *  @param serviceFeeNumerator      A numberator of service fee, should not exceed 100%.
 *  @param mintedTotal              Total token that minted.
 *  @param maxSupply                Max total tokens that user can mint in this drop event.
 *  @param privateRound             Information of private round (See DropRoundRecord struct).
 *  @param publicRound              Information of public round (See DropRoundRecord struct).
 */
struct DropRecord {
    bytes32 root;
    address owner;
    address fundingReceiver;
    address nft;
    address paymentToken;
    uint256 serviceFeeNumerator;
    uint256 mintedTotal;
    uint256 maxSupply;
    DropRoundRecord privateRound;
    DropRoundRecord publicRound;
}

/**
 *  @notice This struct defining param data for creating a drop
 *
 *  @param root                     This data contain merkle root that use for verifying whitelist member.
 *  @param nft                      NFT address that be used for minting.
 *  @param paymentToken             Address of mintting payment token.
 *  @param fundingReceiver          Address of receving minting fee.
 *  @param maxSupply                Max total tokens that user can mint in this drop event.
 *  @param privateRound             Information of private round (See DropRoundRecord struct).
 *  @param publicRound              Information of public round (See DropRoundRecord struct).
 */
struct DropParams {
    bytes32 root;
    address fundingReceiver;
    address nft;
    address paymentToken;
    uint256 maxSupply;
    DropRoundRecord privateRound;
    DropRoundRecord publicRound;
}
