// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "./MetaDropStructs.sol";
import "../Validatable.sol";
import "../interfaces/Collection/ITokenERC721.sol";

/**
 *  @title  MetaVersus NFT Drop
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create an event for droping NFTs, in private round who in whitelist
 *          can mint token with paying a fee. In case the tokens are not sold entirely, anyone can buy
 *          the remaining in public sale round with the higher price.
 */
contract MetaDrop is Validatable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using CountersUpgradeable for CountersUpgradeable.Counter;

    /**
     *  @notice _dropCounter uint256 (counter). This is the counter for store
     *          current drop ID value in storage.
     */
    CountersUpgradeable.Counter private _dropCounter;

    /**
     *  @notice This maapping data contains data of each drop.
     */
    mapping(uint256 => DropRecord) public drops;

    /**
     *  @notice this data contains private minting histories of users.
     *  @dev user address => (drop id => minted counter)
     */
    mapping(address => mapping(uint256 => uint256)) public privateHistories;

    /**
     *  @notice address of Meta Citizen NFT
     */
    IERC721Upgradeable public metaCitizen;

    /**
     *  @notice address of Metaversus Admin
     */
    IAdmin public mvtsAdmin;

    /**
     *  @notice address of Metaversus treasury
     */
    address public treasury;

    /**
     *  @notice Default service fee numberator, value is not exceeds 1e6 (100%)
     */
    uint256 public serviceFeeNumerator;

    /**
     *  @notice The denominator of drop service fee (100%)
     */
    uint256 public constant SERVICE_FEE_DENOMINATOR = 1e6;

    event CreatedDrop(DropRecord drop);
    event UpdatedDrop(DropRecord oldDrop, DropRecord newDrop);
    event MintedToken(uint256 indexed dropId, address indexed account, uint256 indexed amount, uint256 fee);
    event SetServiceFeeNumerator(uint256 indexed oldNumerator, uint256 indexed newNumerator);

    modifier validDrop(uint256 _dropId) {
        require(_dropId > 0 && _dropId <= _dropCounter.current(), "Invalid drop");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        IERC721Upgradeable _metaCitizen,
        IAdmin _mvtsAdmin,
        address _treasury,
        uint256 _serviceFeeNumerator
    ) public initializer notZeroAddress(_treasury) {
        __Validatable_init(_mvtsAdmin);
        __ReentrancyGuard_init();

        metaCitizen = _metaCitizen;
        mvtsAdmin = _mvtsAdmin;
        treasury = _treasury;

        require(_serviceFeeNumerator <= SERVICE_FEE_DENOMINATOR, "Service fee will exceed minting fee");
        serviceFeeNumerator = _serviceFeeNumerator;
    }

    /**
     *  @notice Set service fee numberator (percentage)
     *
     *  @dev Only owner or admin can call this function.
     *
     *  @param _newNumerator New service fee numerator
     */
    function setServiceFeeNumerator(uint256 _newNumerator) external onlyAdmin {
        require(_newNumerator <= SERVICE_FEE_DENOMINATOR, "Service fee will exceed minting fee");

        uint256 oldNumerator = serviceFeeNumerator;
        serviceFeeNumerator = _newNumerator;
        emit SetServiceFeeNumerator(oldNumerator, _newNumerator);
    }

    /**
     *  @notice Create a drop event
     *
     *  @dev    Anyone can call this function
     *
     *  @param  _drop     All drop information that need to create
     */
    function create(DropParams memory _drop) external validTokenCollectionERC721(ITokenERC721(_drop.nft)) {
        require(_drop.root != 0, "Invalid root");
        require(_drop.fundingReceiver != address(0), "Invalid funding receiver");
        require(_drop.maxSupply > 0, "Invalid minting supply");

        require(_drop.privateRound.startTime > block.timestamp, "Invalid private sale start time");
        require(_drop.privateRound.endTime > _drop.privateRound.startTime, "Invalid private sale end time");

        if (_drop.paymentToken != address(0)) {
            require(mvtsAdmin.isPermittedPaymentToken(IERC20Upgradeable(_drop.paymentToken)), "Invalid payment token");
        }

        _dropCounter.increment();
        uint256 dropId = _dropCounter.current();

        drops[dropId] = DropRecord({
            root: _drop.root,
            owner: _msgSender(),
            fundingReceiver: _drop.fundingReceiver,
            nft: _drop.nft,
            paymentToken: _drop.paymentToken,
            serviceFeeNumerator: serviceFeeNumerator,
            mintedTotal: 0,
            maxSupply: _drop.maxSupply,
            privateRound: _drop.privateRound
        });

        emit CreatedDrop(drops[dropId]);
    }

    /**
     *  @notice Update a drop event
     *
     *  @dev    Only drop owner can call this function
     *
     *  @param  _dropId     Id of drop
     *  @param  _newDrop    All new information that need to update
     */
    function update(uint256 _dropId, DropParams memory _newDrop)
        external
        validDrop(_dropId)
        validTokenCollectionERC721(ITokenERC721(_newDrop.nft))
    {
        DropRecord storage drop = drops[_dropId];

        require(_msgSender() == drop.owner, "Only Drop owner can call this function");
        require(_newDrop.root != 0, "Invalid root");
        require(_newDrop.fundingReceiver != address(0), "Invalid funding receiver");
        require(_newDrop.maxSupply > 0, "Invalid minting supply");

        require(_newDrop.privateRound.startTime > 0, "Invalid private sale start time");
        require(_newDrop.privateRound.endTime > _newDrop.privateRound.startTime, "Invalid private sale end time");

        if (_newDrop.paymentToken != address(0)) {
            require(
                mvtsAdmin.isPermittedPaymentToken(IERC20Upgradeable(_newDrop.paymentToken)),
                "Invalid payment token"
            );
        }

        DropRecord memory oldDrop = drop;

        drop.root = _newDrop.root;
        drop.fundingReceiver = _newDrop.fundingReceiver;
        drop.maxSupply = _newDrop.maxSupply;
        drop.paymentToken = _newDrop.paymentToken;
        drop.privateRound = _newDrop.privateRound;

        emit UpdatedDrop(oldDrop, drop);
    }

    /**
     *  @notice Minting a token with a fee.
     *
     *  @dev    With `private sale`, only White List winners can mint token.
     *          With `public sale`, everyone can mint token.
     *  @dev    The user must `approve` enough payment token for this contract before calling this function.
     *
     *  @param  _dropId     Id of drop
     *  @param  _proof      Proof data of user's leaf node
     *  @param  _amount     Amount of token that user want to mint
     */
    function mint(
        uint256 _dropId,
        bytes32[] memory _proof,
        uint256 _amount
    ) external payable validDrop(_dropId) nonReentrant {
        bool canBuy = canBuyToken(_dropId, _msgSender(), _proof);
        require(canBuy, "Not permitted to mint token at the moment");

        uint256 mintable = mintableAmount(_dropId, _msgSender());
        require(mintable >= _amount, "Mint more than allocated portion");

        DropRecord storage drop = drops[_dropId];

        drop.mintedTotal += _amount;
        require(drop.mintedTotal <= drop.maxSupply, "Mint more tokens than available");

        privateHistories[_msgSender()][_dropId] += _amount;

        // payout fee
        uint256 fee = _estimateMintFee(_dropId, _amount);
        _splitPayout(_msgSender(), drop, fee);

        // Mint tokens for user
        ITokenERC721(drop.nft).mintBatch(_msgSender(), _amount);

        emit MintedToken(_dropId, _msgSender(), _amount, fee);
    }

    /**
     *  @notice Split payout minting fee with payment token of drop
     *
     *  @dev    If payment token is zero address, will pay by native token
     *
     *  @param  _account    Account of minted user
     *  @param  _drop       Drop infromation of the payout
     *  @param  _mintFee    Token amount to transfer
     */
    function _splitPayout(
        address _account,
        DropRecord memory _drop,
        uint256 _mintFee
    ) private {
        uint256 serviceFee;

        // Payout service fee for drop service
        if (_drop.serviceFeeNumerator > 0) {
            serviceFee = (_mintFee * _drop.serviceFeeNumerator) / SERVICE_FEE_DENOMINATOR;

            if (_drop.paymentToken != address(0)) {
                IERC20Upgradeable(_drop.paymentToken).safeTransferFrom(_account, treasury, serviceFee);
            } else {
                require(msg.value == _mintFee, "Not enough fee");
                (bool sent, ) = treasury.call{ value: serviceFee }("");
                require(sent, "Failed to send native");
            }
        }

        // Payout minting fee for creator
        uint256 creatorFee = _mintFee - serviceFee;
        if (_drop.paymentToken != address(0)) {
            IERC20Upgradeable(_drop.paymentToken).safeTransferFrom(_account, _drop.fundingReceiver, creatorFee);
        } else {
            (bool sent, ) = _drop.fundingReceiver.call{ value: creatorFee }("");
            require(sent, "Failed to send native");
        }
    }

    /**
     *  @notice Estimate minting fee from amount of tokens that user want to mint.
     *
     *  @param  _dropId     Id of drop
     *  @param  _amount     Amount of token that user want to mint
     */
    function _estimateMintFee(uint256 _dropId, uint256 _amount) private view returns (uint256) {
        return drops[_dropId].privateRound.mintFee * _amount;
    }

    /**
     *  @notice Estimate the maximum token amount that an address can buy.
     *
     *  @param  _dropId     Id of drop
     *  @param  _account    Address of an account to query with
     */
    function mintableAmount(uint256 _dropId, address _account) public view returns (uint256) {
        uint256 mintableLimit = drops[_dropId].privateRound.mintableLimit;
        uint256 mintedAmount = privateHistories[_account][_dropId];

        if (mintableLimit == 0) {
            return drops[_dropId].maxSupply - drops[_dropId].mintedTotal;
        }

        if (mintedAmount == mintableLimit) return 0;
        return mintableLimit - mintedAmount;
    }

    /**
     *  @notice Check if an account has the right to buy token.
     *
     *  @dev    User can only buy tokens when hold a MTVS Citizen NFT and drop is active
     *
     *  @param  _dropId     Id of drop
     *  @param  _account    Address of an account to query with
     *  @param  _proof      Proof data of user's leaf node
     */
    function canBuyToken(
        uint256 _dropId,
        address _account,
        bytes32[] memory _proof
    ) public view returns (bool) {
        if (metaCitizen.balanceOf(_account) == 0) return false;
        return Validatable.isValidProof(_proof, drops[_dropId].root, _account);
    }

    /**
     *  @notice Check if the Drop was still in the first phase where only whitelisted users can buy tokens.
     *
     *  @param  _dropId     Id of drop
     */
    function isPrivateRound(uint256 _dropId) private view returns (bool) {
        return
            block.timestamp >= drops[_dropId].privateRound.startTime && // solhint-disable-line not-rely-on-time
            block.timestamp <= drops[_dropId].privateRound.endTime; // solhint-disable-line not-rely-on-time
    }

    /**
     *  @notice Get current drop counter
     */
    function getCurrentCounter() external view returns (uint256) {
        return _dropCounter.current();
    }
}
