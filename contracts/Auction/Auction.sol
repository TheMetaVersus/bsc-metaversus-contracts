// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

/**
 *  @title  Dev Auction Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract is the auction for exhange non-fungiable token with standard ERC721
 *          all action which user could create, bid them.
 */
contract ManagerAuction is Initializable, OwnableUpgradeable, PausableUpgradeable, ERC721HolderUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressUpgradeable for address payable;

    bytes4 internal constant _INTERFACE_ID_ERC2981 = type(IERC2981Upgradeable).interfaceId;
    bytes4 internal constant _INTERFACE_ID_ERC721 = type(IERC721Upgradeable).interfaceId;
    uint256 public constant DENOMINATOR = 1e5;

    /**
     *  @notice treasury address
     */
    address public treasury;

    /**
     *  @notice systemFee
     */
    uint256 public systemFee;

    /**
     *  @notice total auctions in contract
     */
    uint256 public totalAuctions;

    /**
     *  @notice total bid auctions in contract
     */
    uint256 public totalBidAuctions;

    struct AuctionInfo {
        address owner;
        address tokenAddress;
        IERC20Upgradeable paymentToken;
        uint256 tokenId;
        uint256 startPrice;
        uint256 endPrice;
        uint256 startTime;
        uint256 endTime;
        uint256[] listBidId;
    }

    struct BidAuction {
        address bidder;
        IERC20Upgradeable paymentToken;
        address tokenAddress;
        uint256 tokenId;
        uint256 auctionId;
        uint256 bidPrice;
        bool status;
        bool isOwnerAccepted;
    }

    /**
     *  @notice permitedPaymentToken is mapping address to bool
     */
    mapping(IERC20Upgradeable => bool) public permitedPaymentToken;

    /**
     *  @notice auctions is mapping auctionId to AuctionInfo
     */
    mapping(uint256 => AuctionInfo) public auctions;

    /**
     *  @notice bidAuctions is mapping bidId to BidAuction
     */
    mapping(uint256 => BidAuction) public bidAuctions;

    //hold: createBid
    /**
     *  @notice adminHoldPayment is mapping address payment token to amount
     */
    mapping(IERC20Upgradeable => uint256) public adminHoldPayment;

    /**
     *  @notice userJoinAuction is mapping auctionId => address user => bool
     */
    mapping(uint256 => mapping(address => bool)) public userJoinAuction;

    /**
     *  @notice tokenOnAuction is mapping tokenAddress => tokenId => bool
     */
    mapping(address => mapping(uint256 => bool)) public tokenOnAuction;

    /**
     *  @notice auctionBidCount is mapping auctionId to count
     */
    mapping(uint256 => uint256) public auctionBidCount;

    event AuctionCreated(uint256 indexed _auctionId, address indexed _tokenAddress, uint256 indexed _tokenId);
    event BidAuctionCreated(
        uint256 indexed _bidAuctionId,
        address indexed _tokenAddress,
        uint256 indexed _tokenId,
        uint256 _price,
        IERC20Upgradeable _paymentToken
    );
    event BidAuctionEdited(uint256 indexed _bidAuctionId, uint256 indexed _oldBidAuctionId, uint256 _price);
    event AuctionCanceled(uint256 indexed _auctionId);
    event BidAuctionCanceled(uint256 indexed _bidAuctionId);
    event BidAuctionAccepted(uint256 indexed _bidAuctionId);
    event AuctionReclaimed(uint256 indexed _auctionId);
    event PermitedPaymentTokenChanged(IERC20Upgradeable indexed _paymentToken, bool _accepted);
    event FundsWithdrawed(address indexed _tokenAddress, uint256 _amount);
    event SystemFeeChanged(uint256 _fee);
    event TreasuryChanged(address _oldValue, address _newValue);
    event BoughtAuction(address _user, uint256 _auctionId, uint256 _price);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(address _treasury) public virtual initializer {
        __Ownable_init();
        __Pausable_init();
        __ERC721Holder_init();
        systemFee = 2500; // 2.5%
        treasury = _treasury;
    }

    modifier notZeroAddress(address _address) {
        require(_address != address(0), "ERROR: invalid address!");
        _;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unPause() external onlyOwner {
        _unpause();
    }

    /**
     *  @notice Set system fee
     */
    function setSystemFee(uint256 _newFee) external onlyOwner {
        require(_newFee != systemFee, "SystemFee is already set up");
        require(_newFee <= DENOMINATOR, "Invalid systemFee");
        systemFee = _newFee;
        emit SystemFeeChanged(_newFee);
    }

    /**
     *  @notice Set permit payment token
     */
    function setPermittedPaymentToken(IERC20Upgradeable _token, bool _status) external onlyOwner {
        require(_status != permitedPaymentToken[_token], "PermitedPaymentToken is already set up");
        permitedPaymentToken[_token] = _status;
        emit PermitedPaymentTokenChanged(_token, _status);
    }

    /**
     *  @notice set treasury to change TreasuryManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setTreasury(address _treasury) external onlyOwner notZeroAddress(_treasury) {
        require(_treasury != treasury, "Address treasury is already set up");
        address _oldValue = treasury;
        treasury = _treasury;
        emit TreasuryChanged(_oldValue, treasury);
    }

    /**
     * @notice withdrawFunds
     */
    function withdrawFunds(address payable _beneficiary, address _tokenAddress) external onlyOwner whenPaused {
        uint256 _withdrawAmount;
        if (_tokenAddress == address(0)) {
            _beneficiary.transfer(address(this).balance);
            _withdrawAmount = address(this).balance;
        } else {
            _withdrawAmount = IERC20Upgradeable(_tokenAddress).balanceOf(address(this));
            IERC20Upgradeable(_tokenAddress).safeTransfer(_beneficiary, _withdrawAmount);
        }
        emit FundsWithdrawed(_tokenAddress, _withdrawAmount);
    }

    /**
     *  @notice Check ruyalty without error when not support function supportsInterface
     */
    function isRoyalty(address _contract) private returns (bool) {
        (bool success, ) = _contract.call(abi.encodeWithSignature("supportsInterface(bytes4)", _INTERFACE_ID_ERC2981));

        return success && IERC2981Upgradeable(_contract).supportsInterface(_INTERFACE_ID_ERC2981);
    }

    /**
     *  @notice check and get Royalties information
     *
     *  @dev    All caller can call this function.
     */
    function getRoyaltyInfo(
        address _nftAddr,
        uint256 _tokenId,
        uint256 _salePrice
    ) public view returns (address, uint256) {
        (address royaltiesReceiver, uint256 royaltiesAmount) = IERC2981Upgradeable(_nftAddr).royaltyInfo(
            _tokenId,
            _salePrice
        );
        return (royaltiesReceiver, royaltiesAmount);
    }

    /**
     *  @notice paid amount
     */
    function _paid(
        IERC20Upgradeable _token,
        address _to,
        uint256 _amount
    ) internal {
        if (address(_token) == address(0)) {
            payable(_to).sendValue(_amount);
        } else {
            IERC20Upgradeable(_token).safeTransfer(_to, _amount);
        }
    }

    /**
     *  @notice Transfer nft after auction
     */
    function _transferAfterAuction(
        address _tokenAddress,
        uint256 _tokenId,
        address _recipient
    ) internal {
        IERC721Upgradeable(_tokenAddress).safeTransferFrom(address(this), _recipient, _tokenId);
    }

    /**
     *  @notice pay bid auction
     */
    function _payBidAuction(uint256 _bidAuctionId) internal {
        BidAuction memory bidAuction = bidAuctions[_bidAuctionId];

        IERC20Upgradeable _paymentToken = bidAuction.paymentToken;
        uint256 _bidPrice = bidAuction.bidPrice;
        uint256 _netValue = 0;

        if (isRoyalty(bidAuction.tokenAddress)) {
            (address _royaltiesReceiver, uint256 _royaltiesAmount) = getRoyaltyInfo(
                bidAuction.tokenAddress,
                bidAuction.tokenId,
                _bidPrice
            );

            // Deduce royalties from sale value
            _netValue = _bidPrice - _royaltiesAmount;
            // Transfer royalties to rightholder if not zero
            if (_royaltiesAmount > 0 && _royaltiesReceiver != address(0)) {
                _paid(_paymentToken, _royaltiesReceiver, _royaltiesAmount);
            }
        }

        uint256 _systemAmount = (_bidPrice * systemFee) / DENOMINATOR;
        uint256 _totalEarnings = _systemAmount >= _netValue ? _systemAmount : _netValue - _systemAmount;

        _paid(_paymentToken, auctions[bidAuction.auctionId].owner, _totalEarnings);
    }

    /**
     *  @notice pay auction
     */
    function _payAuction(uint256 _auctionId, uint256 _amount) internal {
        AuctionInfo memory auction = auctions[_auctionId];

        IERC20Upgradeable _paymentToken = auction.paymentToken;
        uint256 _netValue = 0;

        if (isRoyalty(auction.tokenAddress)) {
            (address _royaltiesReceiver, uint256 _royaltiesAmount) = getRoyaltyInfo(
                auction.tokenAddress,
                auction.tokenId,
                _amount
            );

            // Deduce royalties from sale value
            _netValue = _amount - _royaltiesAmount;
            // Transfer royalties to rightholder if not zero
            if (_royaltiesAmount > 0 && _royaltiesReceiver != address(0)) {
                _paid(_paymentToken, _royaltiesReceiver, _royaltiesAmount);
            }
        }

        uint256 _systemAmount = (_amount * systemFee) / DENOMINATOR;
        uint256 _totalEarnings = _systemAmount >= _netValue ? _systemAmount : _netValue - _systemAmount;

        _paid(_paymentToken, auctions[_auctionId].owner, _totalEarnings);
    }

    /**
     *  @notice Transfer nft bid auction
     */
    function _transferAuction(uint256 _auctionId, address _user) internal {
        AuctionInfo storage auction = auctions[_auctionId];
        tokenOnAuction[auction.tokenAddress][auction.tokenId] = false;

        _transferAfterAuction(auction.tokenAddress, auction.tokenId, _user);
    }

    /**
     *  @notice Transfer nft bid auction
     */
    function _transferBidAuction(uint256 _bidAuctionId) internal {
        BidAuction storage bidAuction = bidAuctions[_bidAuctionId];
        tokenOnAuction[bidAuction.tokenAddress][bidAuction.tokenId] = false;

        _transferAfterAuction(bidAuction.tokenAddress, bidAuction.tokenId, bidAuction.bidder);
    }

    /**
     *  @notice return bid auction
     */
    function _returnBidAuction(uint256 _auctionId) internal {
        AuctionInfo memory currentAuction = auctions[_auctionId];
        tokenOnAuction[currentAuction.tokenAddress][currentAuction.tokenId] = false;
        _transferAfterAuction(currentAuction.tokenAddress, currentAuction.tokenId, currentAuction.owner);
    }
}

contract Auction is ManagerAuction {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressUpgradeable for address payable;

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(address _treasury) public virtual override initializer {
        ManagerAuction.initialize(_treasury);
    }

    receive() external payable {}

    /**
     *  @notice create new auction.
     *  @dev    this method can called by anyone
     *  @param  _tokenAddress  address nft
     *  @param  _paymentToken  payment token
     *  @param  _tokenId  tokenId in nft
     *  @param  _startPrice  start price auction
     *  @param  _endPrice  end price auction
     *  @param  _startTime  start time auction
     *  @param  _endTime  ebd time auction
     */
    function createAuction(
        address _tokenAddress,
        IERC20Upgradeable _paymentToken,
        uint256 _tokenId,
        uint256 _startPrice,
        uint256 _endPrice,
        uint256 _startTime,
        uint256 _endTime
    ) external payable whenNotPaused returns (uint256 _auctionId) {
        require(permitedPaymentToken[_paymentToken], "Payment not support");
        require(_endPrice <= _startPrice, "Price invalid");
        require(_startTime <= _endTime, "Time invalid");

        bool isERC721 = IERC721Upgradeable(_tokenAddress).supportsInterface(_INTERFACE_ID_ERC721);
        require(isERC721, "Incorrect token type");

        require(IERC721Upgradeable(_tokenAddress).ownerOf(_tokenId) == msg.sender, "Not owner");

        _auctionId = totalAuctions;

        tokenOnAuction[_tokenAddress][_tokenId] = true;
        IERC721Upgradeable(_tokenAddress).safeTransferFrom(msg.sender, address(this), _tokenId);

        AuctionInfo storage newAuction = auctions[_auctionId];

        newAuction.owner = msg.sender;
        newAuction.tokenAddress = _tokenAddress;
        newAuction.paymentToken = _paymentToken;
        newAuction.tokenId = _tokenId;
        newAuction.startPrice = _startPrice;
        newAuction.endPrice = _endPrice;
        newAuction.startTime = _startTime;
        newAuction.endTime = _endTime;

        totalAuctions += 1;

        emit AuctionCreated(_auctionId, _tokenAddress, _tokenId);

        return _auctionId;
    }

    /**
     *  @notice buy auction.
     *  @dev    this method can called by anyone
     *  @param  _auctionId  auctionId
     */
    function buyAuction(uint256 _auctionId) external payable whenNotPaused {
        AuctionInfo memory currentAuction = auctions[_auctionId];

        require(
            block.timestamp >= currentAuction.startTime && block.timestamp <= currentAuction.endTime,
            "Not in time auction"
        );

        uint256 _amount = currentPriceAuction(_auctionId);

        if (address(currentAuction.paymentToken) == address(0)) {
            require(msg.value >= _amount, "Invalid amount");
        } else {
            IERC20Upgradeable(currentAuction.paymentToken).safeTransferFrom(msg.sender, address(this), _amount);
        }

        _payAuction(_auctionId, _amount);
        _transferAuction(_auctionId, msg.sender);

        emit BoughtAuction(msg.sender, _auctionId, _amount);
    }

    function currentPriceAuction(uint256 _auctionId) public view returns (uint256) {
        AuctionInfo memory currentAuction = auctions[_auctionId];
        uint256 _time = currentAuction.endTime - currentAuction.startTime;
        if (_time == 0) {
            return currentAuction.endPrice;
        }

        if (block.timestamp < currentAuction.startPrice) {
            return currentAuction.startPrice;
        }

        uint256 _decrement = (currentAuction.startPrice - currentAuction.endPrice) / _time;
        uint256 _decrementAmt = (block.timestamp - currentAuction.startTime) * _decrement;

        if (
            _decrementAmt > currentAuction.startPrice ||
            currentAuction.startPrice - _decrementAmt <= currentAuction.endPrice
        ) {
            return currentAuction.endPrice;
        }

        return currentAuction.startPrice - _decrementAmt;
    }

    /**
     *  @notice create bid auction.
     *  @dev    this method can called by anyone
     *  @param  _tokenAddress  address nft
     *  @param  _paymentToken  payment token
     *  @param  _tokenId  tokenId in nft
     *  @param  _auctionId  auctionId
     *  @param  _price  price to bid auction
     */
    function bidAuction(
        address _tokenAddress,
        IERC20Upgradeable _paymentToken,
        uint256 _tokenId,
        uint256 _auctionId,
        uint256 _price
    ) external payable whenNotPaused returns (uint256 _bidAuctionId) {
        AuctionInfo storage currentAuction = auctions[_auctionId];
        require(currentAuction.paymentToken == _paymentToken, "Incorrect payment method");
        require(currentAuction.owner != msg.sender, "Owner can not bid");
        require(
            block.timestamp >= currentAuction.startTime && block.timestamp <= currentAuction.endTime,
            "Not in time auction"
        );

        require(_price >= currentAuction.endPrice, "Price lower than end price");
        require(tokenOnAuction[_tokenAddress][_tokenId], "Auction closed");

        require(!userJoinAuction[_auctionId][msg.sender], "User joined auction");

        auctionBidCount[_auctionId] += 1;

        userJoinAuction[_auctionId][msg.sender] = true;

        BidAuction memory newBidAuction;
        newBidAuction.bidder = msg.sender;
        newBidAuction.bidPrice = _price;
        newBidAuction.tokenId = _tokenId;
        newBidAuction.auctionId = _auctionId;
        newBidAuction.tokenAddress = _tokenAddress;
        newBidAuction.status = true;
        newBidAuction.isOwnerAccepted = false;
        newBidAuction.paymentToken = _paymentToken;

        if (address(_paymentToken) == address(0)) {
            require(msg.value >= _price, "Invalid amount");
        } else {
            IERC20Upgradeable(newBidAuction.paymentToken).safeTransferFrom(newBidAuction.bidder, address(this), _price);
        }

        adminHoldPayment[_paymentToken] += _price;

        bidAuctions[totalBidAuctions] = newBidAuction;
        _bidAuctionId = totalBidAuctions;

        currentAuction.listBidId.push(_bidAuctionId);

        totalBidAuctions++;

        emit BidAuctionCreated(_bidAuctionId, _tokenAddress, _tokenId, _price, _paymentToken);

        return _bidAuctionId;
    }

    /**
     *  @notice edit bid auction.
     *  @dev    this method can called by owner bid auction
     *  @param  _bidAuctionId  bid auctionId
     *  @param  _price  price to new bid auction
     */
    function editBidAuction(uint256 _bidAuctionId, uint256 _price) external payable whenNotPaused returns (uint256) {
        BidAuction storage objEditBidAuction = bidAuctions[_bidAuctionId];
        AuctionInfo storage currentAuction = auctions[objEditBidAuction.auctionId];
        require(auctionBidCount[objEditBidAuction.auctionId] > 0, "Invalid bid");
        require(msg.sender == objEditBidAuction.bidder, "Not owner bid auction");
        require(
            block.timestamp >= currentAuction.startTime && block.timestamp <= currentAuction.endTime,
            "Not in time auction"
        );

        require(objEditBidAuction.status, "Bid cancelled");
        require(_price >= currentAuction.endPrice, "Price lower than end price");

        bool isExcess = objEditBidAuction.bidPrice > _price;
        uint256 amount = isExcess ? objEditBidAuction.bidPrice - _price : _price - objEditBidAuction.bidPrice;

        if (!isExcess) {
            adminHoldPayment[objEditBidAuction.paymentToken] += amount;
            if (address(objEditBidAuction.paymentToken) != address(0)) {
                objEditBidAuction.paymentToken.safeTransferFrom(objEditBidAuction.bidder, address(this), amount);
            } else {
                require(msg.value >= amount, "Invalid amount");
            }
        } else {
            adminHoldPayment[objEditBidAuction.paymentToken] -= amount;
            if (address(objEditBidAuction.paymentToken) != address(0)) {
                objEditBidAuction.paymentToken.safeTransfer(objEditBidAuction.bidder, amount);
            } else {
                payable(msg.sender).sendValue(amount);
            }
        }

        auctionBidCount[objEditBidAuction.auctionId] += 1;

        objEditBidAuction.status = false;
        uint256 oldBidAuctionId = _bidAuctionId;

        bidAuctions[totalBidAuctions] = objEditBidAuction;
        bidAuctions[totalBidAuctions].status = true;
        bidAuctions[totalBidAuctions].bidPrice = _price;
        _bidAuctionId = totalBidAuctions;

        currentAuction.listBidId.push(totalBidAuctions);

        totalBidAuctions++;

        emit BidAuctionEdited(_bidAuctionId, oldBidAuctionId, _price);

        return _bidAuctionId;
    }

    /**
     *  @notice cancel auction.
     *  @dev    this method can called by owner auction
     *  @param  _auctionId  auctionId
     */
    function cancelAuction(uint256 _auctionId) external whenNotPaused returns (uint256) {
        require(block.timestamp < auctions[_auctionId].startTime, "Auction started");

        require(auctions[_auctionId].owner == msg.sender, "Auction not owner");

        AuctionInfo storage currentAuction = auctions[_auctionId];
        require(tokenOnAuction[currentAuction.tokenAddress][currentAuction.tokenId], "Version cancelled");

        tokenOnAuction[currentAuction.tokenAddress][currentAuction.tokenId] = false;

        _transferAfterAuction(currentAuction.tokenAddress, currentAuction.tokenId, msg.sender);

        emit AuctionCanceled(_auctionId);
        return _auctionId;
    }

    /**
     *  @notice cancel bid auction.
     *  @dev    this method can called by owner bid auction
     *  @param  _bidAuctionId  bidAuctionId
     */
    function cancelBidAuction(uint256 _bidAuctionId) external whenNotPaused returns (uint256) {
        BidAuction storage currentBid = bidAuctions[_bidAuctionId];

        require(currentBid.status, "Bid closed");
        require(msg.sender == currentBid.bidder, "Not owner bid auction");

        userJoinAuction[currentBid.auctionId][msg.sender] = false;
        adminHoldPayment[currentBid.paymentToken] -= currentBid.bidPrice;

        currentBid.status = false;
        if (address(currentBid.paymentToken) == address(0)) {
            payable(currentBid.bidder).sendValue(currentBid.bidPrice);
        } else {
            currentBid.paymentToken.safeTransferFrom(address(this), currentBid.bidder, currentBid.bidPrice);
        }

        emit BidAuctionCanceled(_bidAuctionId);

        return _bidAuctionId;
    }

    /**
     *  @notice reclaim auction after auction end.
     *  @dev    this method can called by owner auction
     *  @param  _auctionId  auctionId
     */
    function reclaimAuction(uint256 _auctionId) external whenNotPaused {
        AuctionInfo memory currentAuction = auctions[_auctionId];

        require(currentAuction.endTime < block.timestamp, "Auction not end");
        require(currentAuction.owner == msg.sender, "Auction not owner");

        require(auctionBidCount[_auctionId] == 0, "Auction has a bid");
        require(tokenOnAuction[currentAuction.tokenAddress][currentAuction.tokenId], "Version cancelled");

        _returnBidAuction(_auctionId);

        emit AuctionReclaimed(_auctionId);
    }

    /**
     *  @notice accept bid auction after auction end.
     *  @dev    this method can called by owner auction
     *  @param  _bidAuctionId  bidAuctionId
     */
    function acceptBidAuction(uint256 _bidAuctionId) external whenNotPaused {
        BidAuction storage currentBid = bidAuctions[_bidAuctionId];
        AuctionInfo memory currentAuction = auctions[currentBid.auctionId];
        require(currentAuction.endTime < block.timestamp, "Auction not end");
        require(currentAuction.owner == msg.sender, "Auction not owner");

        require(!currentBid.isOwnerAccepted, "Bid accepted");

        _transferBidAuction(_bidAuctionId);
        _payBidAuction(_bidAuctionId);

        adminHoldPayment[currentBid.paymentToken] -= currentBid.bidPrice;
        currentBid.isOwnerAccepted = true;

        emit BidAuctionAccepted(_bidAuctionId);
    }

    /**
     *  @notice withdraw system fee.
     *  @dev    this method can called by owner contract
     *  @param  _paymentToken  payment token
     */
    function withdrawSystemFee(IERC20Upgradeable _paymentToken) external onlyOwner notZeroAddress(treasury) {
        uint256 feeAmount;
        if (address(_paymentToken) == address(0)) {
            feeAmount = address(this).balance - adminHoldPayment[_paymentToken];
            payable(treasury).sendValue(feeAmount);
        } else {
            feeAmount = IERC20Upgradeable(_paymentToken).balanceOf(address(this)) - adminHoldPayment[_paymentToken];
            IERC20Upgradeable(_paymentToken).safeTransfer(treasury, feeAmount);
        }
    }
}
