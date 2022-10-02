// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
// import "../Marketplace/MetaversusManager.sol";
import "../interfaces/IMetaversusManager.sol";
import "../Validatable.sol";

import "../interfaces/ITokenMintERC721.sol";

/**
 *  @title  MetaVersus NFT Drop
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create an event for droping NFTs, in private round who in whitelist
 *          can mint token with paying a fee. In case the tokens are not sold entirely, anyone can buy
 *          the remaining in public sale round with the higher price.
 */
contract MetaDrop is Validatable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using CountersUpgradeable for CountersUpgradeable.Counter;

    /**
     *  @notice This struct contains data of each drop.
     */
    struct DropRecord {
        /**
         *  @notice This data contain merkle root that use for verifying whitelist member.
         */
        bytes32 root;
        /**
         *  @notice address of Drop owner.
         */
        address owner;
        /**
         *  @notice NFT address that be used for minting.
         */
        address nft;
        /**
         *  @notice Address of mintting payment token.
         */
        address paymentToken;
        /**
         *  @notice Address of receving minting fee.
         */
        address fundingReceiver;
        /**
         *  @notice A consistent fee of minting token in private sale round.
         */
        uint256 privateFee;
        /**
         *  @notice A consistent price of minting token in public sale round.
         */
        uint256 publicFee;
        /**
         *  @notice Private sale round start time.
         */
        uint256 privateStartTime;
        /**
         *  @notice Public sale round start time.
         */
        uint256 publicStartTime;
        /**
         *  @notice Public sale round end time.
         */
        uint256 publicEndTime;
        /**
         *  @notice Max amount of token each user can mint in private sale.
         */
        uint256 privateMintableLimit;
        /**
         *  @notice Max amount of token each user can mint in public sale.
         */
        uint256 publicMintableLimit;
        /**
         *  @notice Total token that minted.
         */
        uint256 mintedTotal;
        /**
         *  @notice Public sale round end time.
         */
        uint256 maxSupply;
    }
    mapping(uint256 => DropRecord) public drops;

    /**
     *  @notice _dropCounter uint256 (counter). This is the counter for store
     *          current drop ID value in storage.
     */
    CountersUpgradeable.Counter private _dropCounter;

    /**
     *  @notice this data contains private minting histories of users.
     *  @dev user address => (drop id => minted counter)
     */
    mapping(address => mapping(uint256 => uint256)) public privateHistories;

    /**
     *  @notice this data contains public minting histories of users.
     *  @dev user address => (drop id => minted counter)
     */
    mapping(address => mapping(uint256 => uint256)) public publicHistories;

    /**
     *  @notice minting payment token validator
     */
    mapping(address => bool) public paymentTokens;

    /**
     *  @notice address of MetaVersus Manager
     */
    IMetaversusManager public metaversusManager;

    /**
     *  @notice address of Meta Citizen NFT
     */
    IERC721Upgradeable public metaCitizen;

    /**
     *  @notice address of Metaversus treasury
     */
    address public treasury;

    event CreatedDrop(DropRecord drop);
    event UpdatedDrop(DropRecord oldDrop, DropRecord newDrop);
    event MintedToken(uint256 dropId, address indexed account, uint256 indexed amount);
    event MetaversusManagerRegistration(address indexed metaversusManager);

    modifier validDrop(uint256 _dropId) {
        require(_dropId > 0 && _dropId <= _dropCounter.current(), "Invalid drop");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        address _treasury,
        address _metaCitizen,
        address[] memory _paymentTokens,
        IMetaversusManager _mtvsManager
    ) public initializer notZeroAddress(_treasury) {
        for (uint256 i = 0; i < _paymentTokens.length; i++) {
            require(_paymentTokens[i] != address(0), "Invalid payment token");
            paymentTokens[_paymentTokens[i]] = true;
        }
        treasury = _treasury;
        metaversusManager = _mtvsManager;
        metaCitizen = IERC721Upgradeable(_metaCitizen);
    }

    /**
     *  @notice Register a Metaversus Manager for some restricted function.
     *
     *  @dev    This can only be called once.
     */
    function registerMetaversusManager() external {
        require(address(metaversusManager) == address(0), "Drop: The MetaVersus Manager has already been registered.");
        metaversusManager = IMetaversusManager(_msgSender());
        emit MetaversusManagerRegistration(address(metaversusManager));
    }

    /**
     *  @notice Create a drop event
     *
     *  @dev    Anyone can call this function
     *
     *  @param  _drop     All drop information that need to create
     */
    function create(DropRecord memory _drop) external {
        require(_drop.owner == _msgSender(), "Invalid Drop owner");
        require(_drop.nft != address(0), "Invalid NFT address");
        require(_drop.fundingReceiver != address(0), "Invalid funding receiver");
        require(_drop.privateStartTime > block.timestamp, "Invalid private sale start time");
        require(_drop.publicStartTime > _drop.privateStartTime, "Invalid public sale start time");
        require(_drop.publicEndTime > _drop.publicStartTime, "Invalid public sale end time");
        require(_drop.mintedTotal == 0, "Minted must be zero");
        require(_drop.maxSupply > 0, "Invalid minting supply");

        if (_drop.paymentToken != address(0)) {
            require(paymentTokens[_drop.paymentToken], "Invalid payment token");
        }

        _dropCounter.increment();
        uint256 dropId = _dropCounter.current();

        drops[dropId] = _drop;

        emit CreatedDrop(_drop);
    }

    /**
     *  @notice Update a drop event
     *
     *  @dev    Only drop owner can call this function
     *
     *  @param  _dropId     Id of drop
     *  @param  _newDrop    All new information that need to update
     */
    function update(uint256 _dropId, DropRecord memory _newDrop) external validDrop(_dropId) {
        DropRecord memory oldDrop = drops[_dropId];

        require(oldDrop.owner == _msgSender(), "Only Drop owner can call this function");
        require(_newDrop.owner == oldDrop.owner, "Invalid Drop owner");
        require(_newDrop.nft != address(0), "Invalid NFT address");
        require(_newDrop.fundingReceiver != address(0), "Invalid funding receiver");
        require(_newDrop.privateStartTime > 0, "Invalid private sale start time");
        require(_newDrop.publicStartTime > _newDrop.privateStartTime, "Invalid public sale start time");
        require(_newDrop.publicEndTime > _newDrop.publicStartTime, "Invalid public sale end time");
        require(_newDrop.mintedTotal == oldDrop.mintedTotal, "Invalid minted total");
        require(_newDrop.maxSupply > 0, "Invalid minting supply");

        if (_newDrop.paymentToken != address(0)) {
            require(paymentTokens[_newDrop.paymentToken], "Invalid payment token");
        }

        drops[_dropId] = _newDrop;

        emit UpdatedDrop(oldDrop, _newDrop);
    }

    /**
     *  @notice Minting a token with a fee.
     *
     *  @dev    With `private sale`, only White List winners can mint token.
     *          With `public sale`, everyone can mint token.
     *  @dev    The user must `approve` enough payment token for this contract before calling this function.
     *
     *  @param  _dropId     Id of drop
     *  @param  _amount     Amount of token that user want to mint
     */
    function mint(uint256 _dropId, uint256 _amount) external validDrop(_dropId) {
        bool canBuy = canBuyToken(_dropId, _msgSender());
        require(canBuy, "Not permitted to mint token at the moment");

        uint256 mintable = mintableAmount(_dropId, _msgSender());
        require(mintable >= _amount, "Mint more than allocated portion");

        drops[_dropId].mintedTotal += _amount;
        require(drops[_dropId].mintedTotal <= drops[_dropId].maxSupply, "Mint more tokens than available.");

        // record minted history
        if (isPrivateRound(_dropId)) {
            privateHistories[_msgSender()][_dropId] += _amount;
        } else {
            publicHistories[_msgSender()][_dropId] += _amount;
        }

        // payment
        uint256 fee = estimateMintFee(_dropId, _amount);
        mintPayment(_msgSender(), _dropId, fee);

        // TODO: Mint tokens for user
        // ITokenMintERC721(drops[_dropId].nft).mintBatch(_msgSender(), _amount);

        emit MintedToken(_dropId, _msgSender(), _amount);
    }

    /**
     *  @notice pay mintting fee with payment token of drop
     *
     *  @dev    If payment token is zero address, will pay by native token
     *
     *  @param  _account    Account of minted user
     *  @param  _dropId     Id of drop
     *  @param  _fee        Token amount to transfer
     */
    function mintPayment(
        address _account,
        uint256 _dropId,
        uint256 _fee
    ) private {
        address paymentToken = drops[_dropId].paymentToken;

        if (paymentToken != address(0)) {
            IERC20Upgradeable(paymentToken).safeTransferFrom(_account, drops[_dropId].fundingReceiver, _fee);
        } else {
            (bool sent, ) = drops[_dropId].fundingReceiver.call{ value: _fee }("");
            require(sent, "Failed to send native");
        }
    }

    /**
     *  @notice Estimate minting fee from amount of tokens that user want to mint.
     *
     *  @param  _dropId     Id of drop
     *  @param  _amount     Amount of token that user want to mint
     */
    function estimateMintFee(uint256 _dropId, uint256 _amount) private view returns (uint256) {
        if (isPrivateRound(_dropId)) {
            return drops[_dropId].privateFee * _amount;
        }

        return drops[_dropId].publicFee * _amount;
    }

    /**
     *  @notice Estimate the maximum cash amount that an address can pay to buy tokens.
     *
     *  @param  _dropId     Id of drop
     *  @param  _account    Address of an account to query with
     */
    function mintableAmount(uint256 _dropId, address _account) public view returns (uint256) {
        if (isPrivateRound(_dropId)) {
            if (drops[_dropId].privateMintableLimit == 0) {
                return drops[_dropId].maxSupply - drops[_dropId].mintedTotal;
            }

            if (privateHistories[_account][_dropId] == drops[_dropId].privateMintableLimit) {
                return 0;
            }

            return drops[_dropId].privateMintableLimit - privateHistories[_account][_dropId];
        }

        // public round
        if (drops[_dropId].publicMintableLimit == 0) {
            return drops[_dropId].maxSupply - drops[_dropId].mintedTotal;
        }

        if (publicHistories[_account][_dropId] == drops[_dropId].publicMintableLimit) {
            return 0;
        }

        return drops[_dropId].publicMintableLimit - publicHistories[_account][_dropId];
    }

    /**
     *  @notice Check if an account has the right to buy token.
     *
     *  @param  _dropId     Id of drop
     *  @param  _account    Address of an account to query with
     */
    function canBuyToken(uint256 _dropId, address _account) public view returns (bool) {
        if (isDropEnded(_dropId)) return false;
        if (isPrivateRound(_dropId)) {
            // TODO: must verify whether is in merkle tree in whitelist
            // return merkle.verify(root, leaf));
        }

        return metaCitizen.balanceOf(_account) > 0;
    }

    /**
     *  @notice Check if the Drop has ended and no one can buy tokens from the Drop anymore.
     *
     *  @param  _dropId     Id of drop
     */
    function isDropEnded(uint256 _dropId) private view returns (bool) {
        return block.timestamp > drops[_dropId].publicEndTime; // solhint-disable-line not-rely-on-time
    }

    /**
     *  @notice Check if the Drop was still in the first phase where only whitelisted users can buy tokens.
     *
     *  @param  _dropId     Id of drop
     */
    function isPrivateRound(uint256 _dropId) private view returns (bool) {
        return
            block.timestamp >= drops[_dropId].privateStartTime && // solhint-disable-line not-rely-on-time
            block.timestamp < drops[_dropId].publicStartTime; // solhint-disable-line not-rely-on-time
    }
}
