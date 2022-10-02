// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "./interfaces/IAdmin.sol";

contract Validatable is PausableUpgradeable {
    /**
     *  @notice paymentToken IAdmin is interface of Admin contract
     */
    IAdmin public admin;

    event SetPause(bool indexed isPause);

    modifier onlyOwner() {
        require(admin.owner() == _msgSender(), "Caller is not an owner");
        _;
    }

    modifier onlyAdmin() {
        require(admin.isAdmin(_msgSender()), "Caller is not an owner or admin");
        _;
    }

    modifier onlyOrder() {
        require(admin.isOrder(_msgSender()), "Caller is not an order contract");
        _;
    }

    modifier validWallet(address _account) {
        require(_account != address(0) && !AddressUpgradeable.isContract(_account), "Invalid wallets");
        _;
    }

    modifier notZeroAddress(address _account) {
        require(_account != address(0), "Invalid address");
        _;
    }

    modifier notZeroAmount(uint256 _amount) {
        require(_amount > 0, "Invalid amount");
        _;
    }

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

    function __Validatable_init(IAdmin _admin) internal onlyInitializing {
        require(
            ERC165CheckerUpgradeable.supportsInterface(address(_admin), type(IAdmin).interfaceId),
            "Invalid Admin contract"
        );

        __Context_init();
        __Pausable_init();
        // TODO Validate
        admin = _admin;
        _pause();
    }
}
