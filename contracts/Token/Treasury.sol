// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "../interfaces/ITreasury.sol";
import "../Validatable.sol";

/**
 *  @title  Dev Treasury Contract
 *
 *  @author Metaversus Team
 *
 *  @notice This smart contract create the treasury for Operation. This contract initially store
 *          all assets and using for purchase in marketplace operation.
 */
contract Treasury is Validatable, ReentrancyGuardUpgradeable, ERC165Upgradeable, ITreasury {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    /**
     *  @notice _permitedTokens mapping from token address to isPermited status
     */
    EnumerableSetUpgradeable.AddressSet private _permitedTokens;

    event Distributed(address indexed paymentToken, address indexed destination, uint256 indexed amount);
    event SetPaymentToken(address indexed paymentToken, bool indexed allow);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(IAdmin _admin) public initializer {
        __Validatable_init(_admin);
        __ERC165_init();
    }

    receive() external payable {}

    /**
     *  @notice Set pernit payment token
     */
    function setPermitedPaymentToken(address _paymentToken, bool allow)
        external
        onlyAdmin
        notZeroAddress(_paymentToken)
    {
        if (allow) {
            _permitedTokens.add(_paymentToken);
        } else if (isPermitedToken(_paymentToken)) {
            _permitedTokens.remove(_paymentToken);
        }

        emit SetPaymentToken(_paymentToken, allow);
    }

    /**
     *  @notice Distribute reward depend on tokenomic.
     */
    function distribute(
        address _paymentToken,
        address _destination,
        uint256 _amount
    ) external onlyAdmin notZeroAddress(_paymentToken) notZeroAddress(_destination) notZero(_amount) nonReentrant {
        require(isPermitedToken(_paymentToken), "ERROR: token is not permit !");
        IERC20Upgradeable(_paymentToken).safeTransfer(_destination, _amount);

        emit Distributed(_paymentToken, _destination, _amount);
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
        return interfaceId == type(ITreasury).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     *  @notice Return permit token status
     */
    function isPermitedToken(address _paymentToken) public view returns (bool) {
        return _permitedTokens.contains(_paymentToken);
    }
}
