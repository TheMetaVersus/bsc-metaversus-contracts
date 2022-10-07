// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

import "./interfaces/IAdmin.sol";
import "./interfaces/IMetaCitizen.sol";

/**
 *  @title  Dev Admin Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract is contract to control access and role to call function
 */
contract Admin is OwnableUpgradeable, ERC165Upgradeable, IAdmin {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    /**
     *  @notice mapping from token ID to isAdmin status
     */
    mapping(address => bool) public admins;

    /**
     *  @notice _permitedPaymentToken mapping from token address to payment
     */
    EnumerableSetUpgradeable.AddressSet private _permitedPaymentToken;

    /**
     *  @notice _permitedNFTs mapping from NFT address to trade
     */
    EnumerableSetUpgradeable.AddressSet private _permitedNFTs;

    /**
     *  @notice metaCitizen is address of metaCitizen pass
     */
    IMetaCitizen public metaCitizen;

    event SetAdmin(address indexed user, bool allow);
    event SetMetaCitizen(IMetaCitizen oldMetaCitizen, IMetaCitizen newMetaCitizen);
    event SetPermittedPaymentToken(IERC20Upgradeable _paymentToken, bool allow);
    event SetPermittedNFT(address _nftAddress, bool allow);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(address _owner) public initializer {
        require(_owner != address(0) && !AddressUpgradeable.isContract(_owner), "Invalid wallet");

        __Ownable_init();
        __ERC165_init();

        transferOwnership(_owner);
    }

    /**
     *  @notice Replace the admin role by another address.
     *
     *  @dev    Only owner can call this function.
     *
     *  @param  _account   Address that will allow to Metaversus admin.
     *  @param  _allow     Status of allowance (true is admin | false is banned).
     */
    function setAdmin(address _account, bool _allow) external onlyOwner {
        require(_account != address(0), "Invalid admin address");

        admins[_account] = _allow;
        emit SetAdmin(_account, _allow);
    }

    /**
     *  @notice Replace the meta citizen address by another address.
     *
     *  @dev    Only owner can call this function.
     *
     *  @param  _citizen    Address of Meta Citizen contract
     */
    function setMetaCitizen(IMetaCitizen _citizen) external onlyOwner {
        require(address(_citizen) != address(0), "Invalid Meta Citizen address");

        IMetaCitizen oldMetaCitizen = metaCitizen;
        metaCitizen = _citizen;
        emit SetMetaCitizen(oldMetaCitizen, metaCitizen);
    }

    /**
     *  @notice Set permit payment token
     *
     *  @dev    Only owner or admin can call this function.
     *
     *  @param  _paymentToken   Token ERC-20 that will accept as market payment token.
     *  @param  _allow          Status of allowance (true is permitted | false is banned).
     */
    function setPermittedPaymentToken(IERC20Upgradeable _paymentToken, bool _allow) external {
        require(isAdmin(_msgSender()), "Caller is not an owner or admin");

        if (_allow) {
            _permitedPaymentToken.add(address(_paymentToken));
        } else if (isPermittedPaymentToken(_paymentToken)) {
            _permitedPaymentToken.remove(address(_paymentToken));
        }

        emit SetPermittedPaymentToken(_paymentToken, _allow);
    }

    /**
     *  @notice Set an NFT that is allowed to trade in Metaversus
     *
     *  @dev    Only owner or admin can call this function.
     *
     *  @param  _nftAddress   Token ERC-721 that will allow trade in the market.
     *  @param  _allow        Status of allowance (true is permitted | false is banned).
     */
    function setPermittedNFT(address _nftAddress, bool _allow) external {
        require(isAdmin(_msgSender()), "Caller is not an owner or admin");

        if (_allow) {
            _permitedNFTs.add(_nftAddress);
        } else if (isPermittedNFT(_nftAddress)) {
            _permitedNFTs.remove(_nftAddress);
        }

        emit SetPermittedNFT(_nftAddress, _allow);
    }

    /**
     * @notice Get owner of this contract
     *
     * @dev Using in related contracts
     */
    function owner() public view override(IAdmin, OwnableUpgradeable) returns (address) {
        return super.owner();
    }

    /**
     *  @notice Check account whether it is the admin role.
     */
    function isAdmin(address _account) public view virtual returns (bool) {
        return admins[_account] || _account == owner();
    }

    /**
     *  @notice Return permit token payment
     *
     *  @param  _token  Address that need to check whether is permitted payment token.
     */
    function isPermittedPaymentToken(IERC20Upgradeable _token) public view returns (bool) {
        return _permitedPaymentToken.contains(address(_token));
    }

    /**
     *  @notice Return permit token payment
     *
     *  @param  _nftAddress  Address that need to check whether is permitted NFT.
     */
    function isPermittedNFT(address _nftAddress) public view returns (bool) {
        return _permitedNFTs.contains(_nftAddress);
    }

    /**
     *  @notice Returns true if account own meta citizen NFT
     *
     *  @param  _account  Address that need to check whether is hold an Citizen NFT.
     */
    function isOwnedMetaCitizen(address _account) external view returns (bool) {
        return IERC721Upgradeable(address(metaCitizen)).balanceOf(_account) > 0;
    }

    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC165Upgradeable, IERC165Upgradeable)
        returns (bool)
    {
        return interfaceId == type(IAdmin).interfaceId || super.supportsInterface(interfaceId);
    }
}
