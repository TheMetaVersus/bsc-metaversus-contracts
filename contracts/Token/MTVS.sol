// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 *  @title  Dev Fungible token
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create the token ERC20 for Operation. These tokens initially are minted
 *          by the only controllers and using for purchase in marketplace operation.
 *          The contract here by is implemented to initial.
 */
contract MTVS is Initializable, OwnableUpgradeable, ERC20Upgradeable {
    /**
     *  @notice controllers mapping from token ID to isComtroller status
     */
    mapping(address => bool) public controllers;

    event SetController(address indexed user, bool allow);
    event Minted(address indexed receiver, uint256 amount);

    modifier onlyControllers() {
        require(
            (owner() == _msgSender() || controllers[_msgSender()]),
            "Ownable: caller is not a controller"
        );
        _;
    }

    modifier notZeroAddress(address addr) {
        require(addr != address(0), "ERROR: invalid address !");
        _;
    }

    modifier notZeroAmount(uint256 amount) {
        require(amount > 0, "ERROR: Amount equal to zero !");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        address _curator,
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,
        address _treasury
    )
        public
        initializer
        notZeroAddress(_curator)
        notZeroAddress(_treasury)
        notZeroAmount(_totalSupply)
    {
        ERC20Upgradeable.__ERC20_init(_name, _symbol);
        OwnableUpgradeable.__Ownable_init();
        transferOwnership(_curator);
        controllers[_curator] = true;
        _mint(_treasury, _totalSupply);
    }

    /**
     *  @notice Check account whether it is the controller role.
     *
     *  @dev    All caller can call this function.
     */
    function isController(address account) external view returns (bool) {
        return controllers[account];
    }

    /**
     *  @notice Set or remove role controllers
     *
     *  @dev    Only owner can call this function.
     */
    function setController(address user, bool allow) external onlyOwner notZeroAddress(user) {
        controllers[user] = allow;
        emit SetController(user, allow);
    }

    /**
     *  @notice Mint token
     *
     *  @dev    Only controllers can call this function.
     */
    function mint(address receiver, uint256 amount)
        external
        onlyControllers
        notZeroAddress(receiver)
        notZeroAmount(amount)
    {
        _mint(receiver, amount);

        emit Minted(receiver, amount);
    }

    /**
     *  @notice Burn token
     *
     *  @dev   All caller can call this function.
     */
    function burn(uint256 amount) external notZeroAmount(amount) {
        _burn(_msgSender(), amount);
    }
}
