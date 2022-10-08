// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "./MetaDropStructs.sol";
import "../Validatable.sol";

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
    mapping(address => mapping(uint256 => uint256)) public mintedHistories;

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
        IAdmin _mvtsAdmin,
        ITreasury _treasury,
        uint256 _serviceFeeNumerator
    ) public initializer validTreasury(_treasury) validAdmin(_mvtsAdmin) {
        __Validatable_init(_mvtsAdmin);
        __ReentrancyGuard_init();

        mvtsAdmin = _mvtsAdmin;
        treasury = address(_treasury);

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
    function create(DropParams memory _drop)
        external
        validTokenCollectionERC721(ITokenERC721(_drop.nft))
        validPaymentToken(IERC20Upgradeable(_drop.paymentToken))
    {
        require(_drop.root != 0, "Invalid root");
        require(_drop.fundingReceiver != address(0), "Invalid funding receiver");
        require(_drop.maxSupply > 0, "Invalid minting supply");

        require(_drop.startTime > block.timestamp, "Invalid start time");
        require(_drop.endTime > _drop.startTime, "Invalid end time");

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
            mintFee: _drop.mintFee,
            mintableLimit: _drop.mintableLimit,
            maxSupply: _drop.maxSupply,
            startTime: _drop.startTime,
            endTime: _drop.endTime
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
        validPaymentToken(IERC20Upgradeable(_newDrop.paymentToken))
    {
        DropRecord storage drop = drops[_dropId];

        require(_msgSender() == drop.owner, "Only Drop owner can call this function");
        require(_newDrop.root != 0, "Invalid root");
        require(_newDrop.fundingReceiver != address(0), "Invalid funding receiver");
        require(_newDrop.maxSupply > 0, "Invalid minting supply");

        require(_newDrop.startTime > 0, "Invalid start time");
        require(_newDrop.endTime > _newDrop.startTime, "Invalid end time");

        DropRecord memory oldDrop = drop;

        drop.root = _newDrop.root;
        drop.fundingReceiver = _newDrop.fundingReceiver;
        drop.paymentToken = _newDrop.paymentToken;
        drop.maxSupply = _newDrop.maxSupply;
        drop.mintFee = _newDrop.mintFee;
        drop.mintableLimit = _newDrop.mintableLimit;
        drop.startTime = _newDrop.startTime;
        drop.endTime = _newDrop.endTime;

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
        require(mintable >= _amount, "Can not mint tokens anymore");

        // record minted history
        mintedHistories[_msgSender()][_dropId] += _amount;

        DropRecord storage drop = drops[_dropId];
        drop.mintedTotal += _amount;

        // payout fee
        uint256 fee = drop.mintFee * _amount;
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
     *  @notice Estimate the maximum token amount that an address can buy.
     *
     *  @param  _dropId     Id of drop
     *  @param  _account    Address of an account to query with
     */
    function mintableAmount(uint256 _dropId, address _account) public view returns (uint256) {
        uint256 mintableLimit = drops[_dropId].mintableLimit;
        uint256 userMinted = mintedHistories[_account][_dropId];
        uint256 available = drops[_dropId].maxSupply - drops[_dropId].mintedTotal;

        // Return available tokens for minting when drop mintable limit is not set
        if (mintableLimit == 0) {
            return available;
        }

        // Return 0 when user has minted all their portion.
        if (userMinted == mintableLimit) return 0;

        uint256 mintable = mintableLimit - userMinted;
        return mintable <= available ? mintable : available;
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
        if (!admin.isOwnedMetaCitizen(_account)) return false;
        if (!isDropActive(_dropId)) return false;
        return Validatable.isValidProof(_proof, drops[_dropId].root, _account);
    }

    /**
     *  @notice Check if the Drop was still active where only whitelisted users can buy tokens.
     *
     *  @param  _dropId     Id of drop
     */
    function isDropActive(uint256 _dropId) private view returns (bool) {
        return
            block.timestamp >= drops[_dropId].startTime && // solhint-disable-line not-rely-on-time
            block.timestamp <= drops[_dropId].endTime; // solhint-disable-line not-rely-on-time
    }

    /**
     *  @notice Get current drop counter
     */
    function getCurrentCounter() external view returns (uint256) {
        return _dropCounter.current();
    }
}
