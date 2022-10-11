// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";

import "./interfaces/IAdmin.sol";
import "./interfaces/ITokenMintERC721.sol";
import "./interfaces/ITokenMintERC1155.sol";
import "./interfaces/ITreasury.sol";
import "./interfaces/IMarketplaceManager.sol";
import "./interfaces/Collection/ICollectionFactory.sol";
import "./interfaces/IStakingPool.sol";
import "./interfaces/IOrder.sol";
import "./interfaces/IMetaCitizen.sol";
import "./interfaces/IMetaversusManager.sol";
import "./interfaces/Collection/ITokenERC721.sol";
import "./interfaces/Collection/ITokenERC1155.sol";
import "./lib/ErrorHelper.sol";

contract Validatable is PausableUpgradeable {
    /**
     *  @notice paymentToken IAdmin is interface of Admin contract
     */
    IAdmin public admin;

    event SetPause(bool indexed isPause);

    /*------------------Check Admins------------------*/

    modifier onlyOwner() {
        require(admin.owner() == _msgSender(), "Caller is not an owner");
        _;
    }

    modifier onlyAdmin() {
        require(admin.isAdmin(_msgSender()), "Caller is not an owner or admin");
        _;
    }

    modifier validWallet(address _account) {
        require(isWallet(_account), "Invalid wallets");
        _;
    }

    /*------------------Common Checking------------------*/

    modifier notZeroAddress(address _account) {
        require(_account != address(0), "Invalid address");
        _;
    }

    modifier notZero(uint256 _amount) {
        require(_amount > 0, "Invalid amount");
        _;
    }

    modifier validPaymentToken(IERC20Upgradeable _paymentToken) {
        require(admin.isPermittedPaymentToken(_paymentToken), "Payment token is not supported");
        _;
    }

    /*------------------Validate Contracts------------------*/

    modifier validOrder(IOrder _account) {
        if (!ERC165CheckerUpgradeable.supportsInterface(address(_account), type(IOrder).interfaceId)) {
            revert ErrorHelper.InValidOrderContract(address(_account));
        }
        _;
    }

    modifier validMetaversusManager(IMetaversusManager _account) {
        if (!ERC165CheckerUpgradeable.supportsInterface(address(_account), type(IMetaversusManager).interfaceId)) {
            revert ErrorHelper.InValidMetaversusManagerContract(address(_account));
        }
        _;
    }

    modifier validTokenCollectionERC721(ITokenERC721 _account) {
        if (!ERC165CheckerUpgradeable.supportsInterface(address(_account), type(ITokenERC721).interfaceId)) {
            revert ErrorHelper.InValidTokenCollectionERC721Contract(address(_account));
        }
        _;
    }

    modifier validTokenCollectionERC1155(ITokenERC1155 _account) {
        if (!ERC165CheckerUpgradeable.supportsInterface(address(_account), type(ITokenERC1155).interfaceId)) {
            revert ErrorHelper.InValidTokenCollectionERC1155Contract(address(_account));
        }
        _;
    }
    modifier validAdmin(IAdmin _account) {
        if (!ERC165CheckerUpgradeable.supportsInterface(address(_account), type(IAdmin).interfaceId)) {
            revert ErrorHelper.InValidAdminContract(address(_account));
        }
        _;
    }

    modifier validTokenMintERC721(ITokenMintERC721 _account) {
        if (!ERC165CheckerUpgradeable.supportsInterface(address(_account), type(ITokenMintERC721).interfaceId)) {
            revert ErrorHelper.InValidTokenMintERC721Contract(address(_account));
        }
        _;
    }

    modifier validTokenMintERC1155(ITokenMintERC1155 _account) {
        if (!ERC165CheckerUpgradeable.supportsInterface(address(_account), type(ITokenMintERC1155).interfaceId)) {
            revert ErrorHelper.InValidTokenMintERC1155Contract(address(_account));
        }

        _;
    }

    modifier validTreasury(ITreasury _account) {
        if (!ERC165CheckerUpgradeable.supportsInterface(address(_account), type(ITreasury).interfaceId)) {
            revert ErrorHelper.InValidTreasuryContract(address(_account));
        }

        _;
    }
    modifier validMarketplaceManager(IMarketplaceManager _account) {
        if (!ERC165CheckerUpgradeable.supportsInterface(address(_account), type(IMarketplaceManager).interfaceId)) {
            revert ErrorHelper.InValidMarketplaceManagerContract(address(_account));
        }
        _;
    }

    modifier validCollectionFactory(ICollectionFactory _account) {
        if (!ERC165CheckerUpgradeable.supportsInterface(address(_account), type(ICollectionFactory).interfaceId)) {
            revert ErrorHelper.InValidCollectionFactoryContract(address(_account));
        }
        _;
    }

    modifier validStakingPool(IStakingPool _account) {
        if (!ERC165CheckerUpgradeable.supportsInterface(address(_account), type(IStakingPool).interfaceId)) {
            revert ErrorHelper.InValidStakingPoolContract(address(_account));
        }
        _;
    }

    modifier validMetaCitizen(IOrder _account) {
        if (!ERC165CheckerUpgradeable.supportsInterface(address(_account), type(IMetaCitizen).interfaceId)) {
            revert ErrorHelper.InValidMetaCitizenContract(address(_account));
        }
        _;
    }

    /*------------------Initializer------------------*/

    function __Validatable_init(IAdmin _admin) internal onlyInitializing validAdmin(_admin) {
        __Context_init();
        __Pausable_init();

        admin = _admin;
    }

    /*------------------Contract Interupts------------------*/

    /**
     *  @notice Set pause action
     */
    function setPause(bool isPause) public onlyOwner {
        if (isPause) _pause();
        else _unpause();

        emit SetPause(isPause);
    }

    /**
     *  @notice Check contract is paused.
     */
    function isPaused() public view returns (bool) {
        return super.paused();
    }

    /*------------------Checking Functions------------------*/

    /**
     *  @notice Check whether merkle tree proof is valid
     *
     *  @param  _proof      Proof data of leaf node
     *  @param  _root       Root data of merkle tree
     *  @param  _account    Address of an account to verify
     */
    function isValidProof(
        bytes32[] memory _proof,
        bytes32 _root,
        address _account
    ) public pure returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(_account));
        return MerkleProofUpgradeable.verify(_proof, _root, leaf);
    }

    function isWallet(address _account) public view returns (bool) {
        return _account != address(0) && !AddressUpgradeable.isContract(_account);
    }
}
